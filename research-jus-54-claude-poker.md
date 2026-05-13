# Claude Poker — Research Report (JUS-54)

**Ticket:** [JUS-54 Research Claude Poker game idea](https://linear.app/justanotherspy/issue/JUS-54/research-claude-poker-game-idea)
**Slack thread:** [#poker, 2026-05-13](https://justanotherspy.slack.com/archives/C0ATX9NUWJZ/p1778672443534079)
**Author:** Dan
**Date:** 2026-05-13
**Status:** Draft for project planning

---

## 1. TL;DR

Build the dealer as an MCP server that owns the rules, deck, and chip stack. Run each Claude player as an independent **Managed Agent session** (one per seat) and push table events into each session using the **Streaming Input + `user.message` event** pattern, not Claude Code Channels. Use **Sonnet 4.6** as the default model with the option to swap in Opus 4.6 or Haiku 4.5 per seat to A/B model strength. Persist a single session per Claude per *game* (not per hand) so each player retains memory of opponents' past play within the bankroll. Use **PokerKit** (Python) as the rules engine inside the dealer to avoid re-implementing hand evaluation, betting rounds, and side pots.

Total stack at a glance: **PokerKit + FastAPI MCP server + Anthropic Managed Agents (one session per seat) + a thin React/SSE UI**.

---

## 2. What we're building (recap)

A web-based Texas Hold'em table where Claude instances play each other (and optionally you). Each Claude gets a persona ("aggressive", "tight", "loose cannon", "limper"), sees only its own hole cards plus public state, and acts via MCP tool calls (bet / raise / call / fold / check). A separate **evaluation view** exposes all hole cards, each Claude's thinking, declared bluff flags, and computed odds/EV. Players can emit fixed "table chat" lines for flavour.

The thread settled on a clean three-layer split:

- **Interface layer** — human UI plus MCP exposure to agents.
- **Game system layer** — dealer logic, rules enforcement, the MCP server itself.
- **Data layer** — game state persistence.

Three things were flagged as needing research: how to *push* state changes to each Claude, whether to co-locate Claudes with the dealer or run them as managed VMs, and how to handle conversation context across hands.

---

## 3. Architecture: how to push events to each Claude

This is the load-bearing question. There are four credible mechanisms; only one fits the use case cleanly.

### Option A: Claude Code Channels (NO)

[Channels](https://code.claude.com/docs/en/channels) push external events into a *Claude Code* session via plugin MCP servers (Telegram, Discord, iMessage, custom). They invert the normal MCP polling model: the server pushes, Claude reacts. Sounds perfect, but it's designed for a developer at a terminal — one session, one user, bidirectional chat bridge. Spinning up six Claude Code processes to simulate six seats is wasteful and ergonomically wrong. Skip.

### Option B: Custom MCP notifications + sampling (PARTIAL FIT)

The MCP spec supports server-initiated [notifications](https://modelcontextprotocol.io/docs/learn/architecture) over an SSE stream, plus [sampling](https://modelcontextprotocol.io/specification/draft/client/elicitation) (server asks client to generate a completion) and elicitation. You *can* model "it's your turn" as a server-pushed notification. But standard MCP clients (including the Anthropic API) treat MCP servers as tools the model calls — they don't automatically wake the model on a notification. You'd be building a custom client loop that interprets notifications as "go run inference now", which is essentially what Managed Agents already does.

### Option C: Managed Agents — Streaming Input + session events (RECOMMENDED)

The [Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) API is built exactly for this: a long-lived agent session you can stream events into and out of. Specifically:

- **Start one session per seat.** Each session gets a system prompt with the seat's persona and the rules of poker.
- **Push table events as `user.message` events** into the running session. [Streaming input](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) and [session events](https://platform.claude.com/docs/en/managed-agents/events-and-streaming) let you inject new messages into an active agent without restarting the loop. So when seat 3 raises, the dealer fires a `user.message` like `{"event":"raise","seat":3,"amount":200}` into seats 1, 2, 4, 5, 6.
- **Receive actions via SSE.** Each agent streams back tool calls; the dealer parses, validates against the rules engine, applies, and broadcasts the resulting state change to all seats.
- **MCP tool exposed by the dealer** for actions: `act(action: bet|raise|call|fold|check, amount?: int, bluff_declared: bool, table_chat?: string)`.

This gives you push semantics for free, isolation per agent, observability via session events, and no need to build your own agent loop, sandbox, or scaling layer.

### Option D: Self-hosted Agent SDK loop (DEFER)

The [Agent SDK](https://platform.claude.com/docs/en/agent-sdk/sessions) gives you the same primitives as a library you host yourself. More control, no $0.08/session-hour fee, but you're building your own runtime, checkpointing, and isolation. Per Anthropic's own [comparison](https://platform.claude.com/docs/en/agent-sdk/hosting), this is the right call if you outgrow Managed Agents or need cross-provider portability. For a research project: don't bother yet.

### Recommendation

**Use Managed Agents with Streaming Input.** One session per seat, lifetime = one game (multiple hands). Push table state changes as `user.message` events. Receive `act` MCP calls. The $0.08/session-hour fee for 6 seats over a 2-hour game is ~$1 — trivial compared to the engineering you'd save.

---

## 4. Co-located vs managed runtime

The thread asked: run Claudes on the same box as the dealer for low latency, or use managed agent VMs?

Three honest considerations:

- **Latency.** Claude inference time (seconds to tens of seconds per action) dominates any network hop. Co-location buys you ~50ms vs ~150ms RTT. Noise.
- **Operational cost.** Self-hosted means you handle process isolation, restart on crash, fair scheduling. Managed Agents handles all of that.
- **Vendor coupling.** Managed Agents is Claude-only. Since the whole project is "evaluate Claude variants playing poker", that's not a constraint — it's the point.

**Recommendation: Managed Agents.** If you later want a "Claude vs GPT-5 vs Gemini" exhibition match, fall back to the Agent SDK and host the loop yourself.

---

## 5. Multi-round context strategy

The thread asked whether to use a single context window per game or reset per hand.

There are three options:

| Strategy | Per-hand cost | Opponent modelling | Risk |
|---|---|---|---|
| Fresh context per hand | Lowest tokens | None — every hand is a stranger | Boring play, no meta-game |
| One session per *game* (multiple hands) | Grows linearly with hand count | Good — sees prior bets, showdowns, declared bluffs | Context bloat over 50+ hands |
| Persistent session with periodic summarisation | Bounded | Best | More engineering |

The [Readable Minds](https://arxiv.org/html/2604.04157v1) paper found that **persistent memory is the critical enabler of theory-of-mind-like behaviour** in LLM poker agents — without it, models don't develop opponent models. That maps directly onto your "see if a player meant to make that play" goal.

**Recommendation: one Managed Agents session per seat per game.** Set the system prompt to include the persona, rules, and seat number. Use the agent's natural context retention across hands. When you do longer tournaments (>50 hands), add a periodic "session summary" message that compresses prior hands into "Seat 4 has folded to 3-bets 6/7 times" style observations — fold the summary into the live context and prune older raw events.

---

## 6. Dealer / rules engine

Don't roll your own. Three options:

- **[Treys](https://github.com/ihendley/treys)** — pure-Python hand evaluator, fast enough at human pace, MIT-licensed. Hand evaluation only, no game state.
- **[eval7](https://pypi.org/project/eval7/)** — C-backed evaluator, faster, narrower feature set.
- **[PokerKit](https://arxiv.org/pdf/2308.07327)** — full game simulator: state machine, betting rounds, side pots, multiple variants (Hold'em, Omaha, Stud). Designed for exactly this kind of research.

**Recommendation: PokerKit.** It gives you the dealer state machine for free. Wrap it in an MCP server that exposes `act(...)` as the only mutating tool agents can call, and `get_table_state(seat_id)` as a read tool (filtered so each seat only sees public info + own hole cards).

Compute EV and outs server-side using PokerKit hand evaluation against simulated rollouts — don't ask the model to do math. Surface these to the evaluation view only, not the player view.

---

## 7. Model selection

The thread asked about Sonnet vs Opus vs Haiku per seat.

Current state (per [Claude benchmarks 2026](https://www.morphllm.com/claude-benchmarks)):

- **Opus 4.6** — best at deep reasoning (GPQA 91.3%, ARC-AGI-2 68.8%). $15/$75 per Mtok. Use for the "expert player" seat.
- **Sonnet 4.6** — 79.6% SWE-bench, leads on MCP-Atlas (tool-use). $3/$15 per Mtok. Default daily driver.
- **Haiku 4.5** — fastest, cheapest. Good for "loose cannon" or "limper" personas where you want fast, less deliberate play. Also fine for the table-chat side-channel.

**Recommendation: Sonnet 4.6 as the default seat model, with one Opus seat and one Haiku seat to A/B in early games.** Tag each session's events with the model used so you can post-hoc compare aggression, fold equity capture, and bluff success rate by model.

---

## 8. Prior art worth reading

- **[Readable Minds: Emergent Theory-of-Mind-Like Behavior in LLM Poker Agents](https://arxiv.org/html/2604.04157v1)** — the closest analogue to what you're building. Uses Claude Sonnet, a central game-server dealer, and independent Claude Code agent instances per seat. Persistent memory is the headline finding. Read this first.
- **[PokerGPT](https://arxiv.org/abs/2401.06781)** — end-to-end lightweight LLM solver for multi-player Hold'em, fine-tuned with RLHF. Different approach (small fine-tuned model), but their action-encoding scheme is borrowable.
- **[PokerBench](https://arxiv.org/html/2501.08328v1)** — 11k pre-flop and post-flop scenarios. Useful as a *training/eval set for personas* — you could ask an Opus persona to label each scenario and use it as a sanity check that the model knows GTO baselines.
- **[Husky Hold'em Bench](https://openreview.net/pdf?id=jARUSddVIB)** — LLMs design poker bots that compete in a round-robin. Different framing (model writes code) but the eval methodology is instructive.
- **[strangeloopcanon/llm-poker](https://github.com/strangeloopcanon/llm-poker)** — minimal multi-LLM Hold'em environment. Worth skimming for prompt structure.

---

## 9. Bluff declarations and chat

Two of your ideas are unusually good and worth calling out:

- **Mandatory bluff declaration before action, revealed at showdown.** This separates *intentional* bluffs from "I had no idea what to do and got lucky". From an eval standpoint, it gives you a labelled dataset for bluff-quality, which is otherwise really hard to measure. Implement as a required field on the `act` tool: `bluff_declared: bool`. Server hides it from other seats until showdown.
- **Fixed-message table chat.** Reduces noise and prevents prompt injection between agents. Keep the menu short (~10 phrases: "nice hand", "interesting bet", "going for it", etc). Expose as `say(phrase_id)` tool call.

---

## 10. UI sketch

Two views, both fed by SSE from the dealer:

**Player view** (`/seat/:id`) — only that seat's hole cards, the board, pot, stacks, action history with declared bluffs *hidden until showdown*. This is what you'd watch in a game mode.

**Evaluation view** (`/observer`) — all hole cards, each Claude's streamed thinking (a panel per seat), declared bluff flags live, server-computed odds/EV/outs per seat, action history with annotations.

Both views subscribe to the same dealer event stream; the seat view filters out information the player shouldn't see. Server is the source of truth — never trust the client to hide hole cards.

---

## 11. Recommended stack

| Layer | Pick |
|---|---|
| Dealer + rules | **Python 3.12, FastAPI, PokerKit** |
| Agent runtime | **Anthropic Managed Agents** (one session per seat) |
| Push protocol | **Managed Agents `user.message` events** for agents; **SSE** for the UI |
| MCP server | FastMCP or the Anthropic Python MCP SDK, exposing `act(...)`, `say(phrase_id)`, `get_table_state(seat_id)` |
| Models | Sonnet 4.6 default, Opus 4.6 and Haiku 4.5 as comparison seats |
| Storage | SQLite for game logs + per-hand replays; Postgres later if needed |
| Frontend | React + EventSource (SSE), one component per seat panel |

---

## 12. Open questions / next steps

1. **Action timeout.** A Claude can take 20+ seconds per decision. Do we set a hard timeout (default fold on expiry) or let games run at "Claude speed"?
2. **Tournament vs cash.** Single bankroll across a session, or rebuys? Affects how meaningful "wins" are.
3. **Token budget per game.** With Opus at a 6-seat table over 30 hands, you're looking at non-trivial spend. Cap per game.
4. **Persona prompt format.** Need to draft and test the system prompts for each persona. Worth a small spike: take 5 PokerBench scenarios, run each persona, eyeball whether the play matches the label.
5. **Bluff declaration enforcement.** Tool schema requires the field, but a Claude could just always say `bluff_declared: false`. Worth thinking about whether the eval is interesting if models lie about declarations.

A reasonable v0 milestone: heads-up (2 seats), one hand at a time, no UI yet — just terminal logs. Validate the Managed Agents push mechanism end-to-end before building the React layer.

---

## Sources

- [Push events into a running session with channels](https://code.claude.com/docs/en/channels) — Claude Code Docs
- [Session event stream](https://platform.claude.com/docs/en/managed-agents/events-and-streaming) — Claude API Docs
- [Claude Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview) — Claude API Docs
- [Hosting the Agent SDK](https://platform.claude.com/docs/en/agent-sdk/hosting) — Claude API Docs
- [Work with sessions](https://platform.claude.com/docs/en/agent-sdk/sessions) — Claude API Docs
- [Streaming Input vs Single Mode](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) — Claude API Docs
- [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview) — Claude API Docs
- [Claude Benchmarks 2026](https://www.morphllm.com/claude-benchmarks) — Morph LLM
- [MCP Architecture overview](https://modelcontextprotocol.io/docs/learn/architecture) — Model Context Protocol
- [MCP Elicitation spec](https://modelcontextprotocol.io/specification/draft/client/elicitation) — Model Context Protocol
- [Readable Minds: Emergent ToM in LLM Poker Agents](https://arxiv.org/html/2604.04157v1) — arXiv
- [PokerGPT](https://arxiv.org/abs/2401.06781) — arXiv
- [PokerBench](https://arxiv.org/html/2501.08328v1) — arXiv
- [Husky Hold'em Bench](https://openreview.net/pdf?id=jARUSddVIB) — OpenReview
- [PokerKit Python Library](https://arxiv.org/pdf/2308.07327) — arXiv
- [Treys](https://github.com/ihendley/treys) — GitHub
- [eval7](https://pypi.org/project/eval7/) — PyPI
- [strangeloopcanon/llm-poker](https://github.com/strangeloopcanon/llm-poker) — GitHub
- [JUS-54: Research Claude Poker game idea](https://linear.app/justanotherspy/issue/JUS-54/research-claude-poker-game-idea) — Linear
- [#poker Slack thread, 2026-05-13](https://justanotherspy.slack.com/archives/C0ATX9NUWJZ/p1778672443534079) — Slack
