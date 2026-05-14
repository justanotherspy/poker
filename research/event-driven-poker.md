# Architecting a Real-Time Distributed Poker Game on Anthropic Managed Agents

This report goes deep on the eight implementation questions you raised about running 3–6 Claude seats around a FastAPI/PokerKit table on Fly.io, with Managed Agents acting as the per-seat “brain.” The short version: Managed Agents has exactly the primitive you need (an append-only event log per session that accepts pushed `user.*` events while the session is running or idle), but the way it processes those events forces some specific design choices around pre-turn information, per-seat identity, and token economy.

-----

## 1. PUSH semantics: how `POST /sessions/{id}/events` actually behaves

The Managed Agents harness exposes a session as a state machine with four statuses: `idle` (waiting for input), `running` (Claude is actively executing), `rescheduling` (transient retry), and `terminated` (final).  The official documentation and Anthropic’s own published skills/reference repo state explicitly: **“Events can be sent when the session is running or idle. Messages are queued and processed in order.”**   A `processed_at` timestamp on each event indicates server-side admission — a `null` value means “queued by the harness, will be handled after preceding events finish processing.”  So the answers to your sub-questions are:

- **Idle pushes:** A `user.message` POSTed while a session is idle moves the session from `idle → running` and Claude immediately starts a new generation that has the new event in context.
- **Running pushes:** A `user.message` POSTed while the session is already `running` does **not** preempt the current turn. It is appended to the durable event log and held in queue. As soon as the current generation reaches a natural stop point (the agent emits `session.status_idle`), the harness pulls the queued event and starts another `running` turn. Multiple queued events all enter the next turn together, in arrival order.
- **Staleness risk:** Yes, this is real. If you push “Seat 3 raised to 400” at T=0 while the agent is mid-decision on a prior turn, the agent will finish that prior turn against stale state, *then* observe the raise. For a poker dealer this is actually fine — the agent’s previous turn already produced an action that the dealer will reject if it’s no longer this agent’s turn, and the new state arrives before the agent is asked to act next. But you should never push an `act` prompt without first re-stating the current ground truth, because Claude may have decided its move based on context that was true 800 ms ago.
- **Interrupting a running turn:** A separate `user.interrupt` event type exists and *does* preempt — it marks the current span as interrupted  and forces the session back to a clean `idle`. Reserve this for “hand cancelled / player disconnected” type events, not for normal table updates, because it discards the partial reasoning trace.

The session’s event log is append-only and decoupled from any client connection (Anthropic’s engineering blog calls this the “brain vs. hands vs. session log” split).   That means the dealer can crash, reconnect, and the queue is preserved.

-----

## 2. The dealer ↔ agent transport in both directions

For each AI seat the dealer maintains:

- **Outbound (dealer → Claude):** plain HTTPS `POST /v1/sessions/{id}/events` with a JSON body of one or more `user.message` events. There is no more efficient mechanism — there is no WebSocket or persistent ingress for user events. Each table event becomes one POST per AI seat (so a 5-AI table = 5 fan-out POSTs per dealer-observable game event). At ~600 read-side RPM and 300 write-side RPM per org,  batching multiple table events into a single POST per seat (the `events` parameter is an array) is the standard optimisation.
- **Inbound (Claude → dealer):** `GET /v1/sessions/{id}/events/stream`  with `Accept: text/event-stream`.  This is the long-lived SSE channel the research doc refers to as the “seat_listener task.” It receives `agent.message`, `agent.tool_use`, `agent.mcp_tool_use`, `agent.thinking`, `session.status_running`, and `session.status_idle` events.

Two operational caveats worth wiring in from day one. First, the SSE stream has **no replay**: if it drops mid-turn, on reconnect you must `GET /v1/sessions/{id}/events` (the list endpoint), dedupe by event ID, and only then resume streaming — otherwise you can deadlock the session if the drop happened while a `requires_action` tool use was pending.  Second, HTTP-client read timeouts (Python `httpx.Timeout`, `requests.timeout=(c,r)`) are per-chunk, not wall-clock, so a trickling SSE connection can block indefinitely; track elapsed time at the loop level explicitly. 

-----

## 3. Pre-turn thinking: every `user.message` triggers a generation

This is the most important constraint in the entire design. **Every `user.message` event transitions an idle session into `running`, which means Claude runs a model turn and produces output before going back to `idle`.** There is no “silent context injection” primitive in the public Managed Agents surface — the only inputs that don’t trigger generation are tool-confirmation replies (`user.tool_confirmation`) and custom-tool results (`user.custom_tool_result`), and both of those only resolve a pending `requires_action` state rather than introducing new information.

This has direct implications for “thinking ahead”:

1. **You cannot push every “Seat 3 raised” event individually as a `user.message` without burning tokens.** Each push generates at minimum an `agent.message` (often empty or a one-line acknowledgement) plus per-turn input-token re-processing of the system prompt and tool list. With prompt caching this is cheaper than a cold turn, but at 5 hands/min × ~30 events/hand × 4–5 AI seats it is still hundreds of incremental generations per game.
1. **The “real” pattern is to push only when you want the agent to do work, and let the system prompt + tool calls reconstruct state on demand.** The bootstrap `user.message` at session creation tells the agent its seat_id, the rules, and crucially that “you will be notified only when it is your turn to act; when notified, call `get_table_state(your_seat_id)` first.” Then the only `user.message` events the dealer sends mid-game are:
- `"It is your turn. Action is on you. Call get_table_state() then act()."` (one per agent decision)
- `"Hand 17 starting. Your hole cards have been dealt."` (one per hand-start)
- Optional: `"Showdown — here is what each opponent revealed: ..."` (one per showdown, for ToM memory building, since this is information the agent could not otherwise observe).

The “watch every action before your turn” pattern from human poker is best satisfied **inside `get_table_state()`’s response**, not via streamed pushes. PokerKit can return the full action history for the current hand as part of the table-state payload, and the agent re-reads it on each turn. This costs one MCP round-trip per decision but zero incremental Claude generations, and it sidesteps the staleness problem entirely because the state read happens at decision time.

If you do want continuous awareness (so the agent’s `agent.thinking` traces explicitly chain across the hand for richer ToM data, à la *Readable Minds*), the compromise is to push terse compacted updates with an explicit instruction not to act: e.g. `user.message: "OBSERVE ONLY — do not act. Update: Seat 3 raised to 400. Acknowledge with one word."` The agent will still generate a turn (you can’t avoid that), but you cap output at ~5 tokens with `<observation_only>` formatting in the system prompt and Claude reliably emits “noted.” Empirically this is roughly an order of magnitude cheaper than a real reasoning turn, but it is still not free. For most production designs the cleaner choice is “push only on turn, let `get_table_state()` carry history.”

-----

## 4. Per-seat identity with a shared vault: the actual security model

This is the area where the existing research doc is most underspecified, and it matters because poker is an adversarial game with hidden information.

**What Managed Agents gives you.** Sessions reference one or more vaults by `vault_ids` at creation.  Each vault holds credentials keyed by `mcp_server_url`.  For the `static_bearer` credential type, Anthropic injects the stored token as an `Authorization: Bearer <token>` header on every MCP call the session makes. There is currently **no supported mechanism to send any other custom header** (an open feature request — anthropic-sdk-python issue #989 — confirms `authorization_token` is the only header path), and **no automatic injection of session_id or seat_id** into outbound MCP requests. Per Anthropic’s Connectors docs: “Without OAuth, Claude does not pass any user identity information to your server. No user IDs, session tokens, or IP addresses.”  For ZDR purposes, the MCP connector is also explicitly not covered.

**Therefore the “shared bearer token, agent self-declares its seat_id in the tool call” pattern is unsafe by default.** A confused (or deliberately probing) agent calling `get_table_state(seat_id=2)` from seat 4’s session will, with a shared bearer, see seat 2’s hole cards. There is no cryptographic binding between session and seat at the MCP layer.

**Recommended pattern: one vault per seat, one bearer token per seat.**

1. At table-creation time, the dealer mints `N` random per-seat tokens (`tbl_42_seat_1_<random>`, …, `tbl_42_seat_N_<random>`) and stores the `(token → table_id, seat_id)` mapping in the dealer’s own DB.
1. For each AI seat the dealer creates a **separate vault** (`POST /v1/vaults`), adds one `static_bearer` credential for the FastAPI MCP server URL bound to that seat’s token, and creates the seat’s session with `vault_ids=[that_vault.id]`.
1. The FastAPI MCP server (the PokerKit-backed `get_table_state` / `act` / `say` server) reads the bearer on every call, looks up the seat_id, and **ignores any `seat_id` argument supplied by the agent**, or rejects calls where the supplied seat_id doesn’t match the bearer-derived one.

This collapses the per-seat scoping problem to “did the right credential reach the right session at creation?” — which is a single dealer-controlled write and cannot be tampered with by Claude. Vault credentials are workspace-scoped  and Anthropic re-resolves them periodically during the session, so rotation is also clean. The 20-credentials-per-vault and 20-MCP-servers-per-agent limits are not a constraint here (one credential per vault), and you can pool/reuse vaults across games by archiving the bearer credential and creating a new one for the same `mcp_server_url` at the start of the next game.

A weaker but still acceptable variant if you don’t want N vaults: use **one vault with one static bearer**, but encode the seat assignment inside the FastAPI server by issuing per-session **path-scoped** MCP URLs (`https://mcp.poker.fly.dev/sessions/{opaque_seat_handle}/mcp`) and registering each seat’s session with a different `mcp_servers[].url`. The MCP connector binds the credential by URL, so different sessions hit different paths; the FastAPI server validates the path token. This avoids creating one vault per seat but requires the dealer to provision N distinct MCP URLs.

-----

## 5. Mixed human + AI tables

The cleanest framing is: **the dealer is the single source of truth, and an “agent” is just a software adapter to whatever entity sits in a seat.** For each seat the dealer holds a polymorphic handle that exposes a uniform interface — `notify_event(table_event)` and an awaitable `wait_for_action() -> Action`. The two implementations are:

- **AI seat:** `notify_event` issues `POST /v1/sessions/{id}/events`. `wait_for_action` consumes the SSE stream, looks for a `agent.mcp_tool_use` whose tool is `act`, and returns the action argument.
- **Human seat:** `notify_event` pushes a JSON message over the seat-owner’s WebSocket to the browser UI. `wait_for_action` awaits a `WebSocket.receive_json()` whose `type == "act"`.

The turn loop, written as PokerKit’s `state.actor_index`-driven coroutine, calls `seats[i].wait_for_action()` and is agnostic to seat type. The only places that differ are: (a) a timer/watchdog — humans get 30s + a time-bank, AI seats get a shorter budget tied to Claude’s expected latency; and (b) input validation strictness — humans’ UI constrains them, but you still server-side validate; AI seats are *just as untrusted as humans*, because Claude can hallucinate an illegal bet size or attempt to act out-of-turn. PokerKit’s legal-action enumeration must be the gate in both cases. The “AI is special” assumption is the bug.

For shared/global table events (“Board: Ace of Spades dealt”), the dealer broadcasts to all seats — humans get the WebSocket update, AI seats get `POST /events`. The presence of a human at the table changes nothing about how AI seats are wired.

-----

## 6. The efficient turn-based pattern

Synthesising sections 3 and 4, the recommended pattern is:

1. **At table start**, for each AI seat: create vault → create session with `vault_ids` + agent + environment → send a bootstrap `user.message` with the rules, seat_id, opponent seat list, stack sizes, and a strict instruction set: *“You will receive a ‘YOUR TURN’ message when action is on you. At that moment, call get_table_state() to read the current state including the action history this hand, then call act(). Between turns, you will receive optional context messages prefixed [HAND_END] containing showdown results — record opponent tendencies to your memory. Never call act() unprompted.”*
1. **During the hand**, the dealer pushes **nothing** to AI seats until it is that seat’s turn. PokerKit drives the turn order; for each AI actor the dealer POSTs a single `user.message` like `"YOUR TURN — pot 450, to call 100, your stack 1800."` (Including the most decision-critical numbers in the prompt itself reduces MCP round trips for low-stakes decisions.)
1. **At end of hand**, the dealer pushes one `[HAND_END]` `user.message` to every seat with the showdown information they’re entitled to see (revealed cards, who won, pot size). This is the ToM-feeding event — it is the only place opponent hole cards ever enter an agent’s context, and only when they were revealed at showdown. The *Readable Minds* finding that persistent memory is necessary and sufficient for ToM emergence (Cliff’s delta = 1.0)  maps directly onto this: across 50 hands the agent’s session log + Managed Agents’ memory store accumulates the opponent model.
1. **Use Anthropic memory stores** (`client.beta.memory_stores`) for cross-game persistence if you want opponent models that survive table breakups. Memory stores are independent of sessions and not deleted when a session is deleted.

This pattern keeps each AI seat at roughly one Claude turn per hand-decision (4–8 turns per hand for a typical 6-max hand) plus one observation turn at hand-end. With Sonnet’s 5-minute prompt-cache TTL, back-to-back turns within the same hand are mostly cache reads, dramatically reducing per-token cost — the platform docs explicitly call this out as the intended optimisation. Session-runtime billing ($0.08/session-hour, metered to the millisecond, **idle time excluded**  per Anthropic) means an idle agent waiting for its turn doesn’t bleed money — only the wall-clock spent in `running` is billed.

-----

## 7. Fly Sprites vs. Managed Agents

Sprites (launched January 2026; sprites.dev)  are Fly.io’s Firecracker-based **persistent micro-VMs** purpose-built for “an entire Linux box that boots in 1–2 s, holds 100 GB of persistent storage, sleeps for free when idle, and supports checkpoint/restore.” They come with Claude/Gemini/Codex preinstalled, designed for coding-agent isolation in `--dangerously-skip-permissions` mode.

The crucial distinction is what each product **manages**:

- **Sprites** manages **the agent’s execution environment** (a Linux VM where the agent process runs). You still bring your own agent loop, your own model API client, your own tool routing, your own event log, your own auth-token plumbing. Sprites is closer in spirit to “EC2 for agents.”
- **Managed Agents** manages **the agent loop itself**, plus a per-session container for tool execution, plus the durable event log, plus credential vaults, plus SSE streaming, plus context compaction, plus prompt caching. You configure an agent declaratively and POST events at it.

For your poker use case, Sprites would be the wrong tool — there is no need for per-agent persistent filesystems, no large package installs, no shell access. The agents are doing pure reasoning over an external API (your FastAPI MCP server). Anthropic’s session log already gives you the durable history that ToM needs. The only scenario where Sprites would win is if you wanted each AI seat to run a *custom* harness — for example, to mix Claude with a locally-running counterfactual-regret-minimisation solver as a hybrid agent, or to do something experimental like spawn helper Python processes for equity calculations inside the agent’s sandbox. For a stock “Claude as a poker player calling tools” workload Managed Agents is strictly simpler.

One legitimate Sprites use, complementary to Managed Agents: run the **dealer itself** (the FastAPI + PokerKit + per-seat WebSocket fan-out service) on Fly Machines (not Sprites — Sprites are for agentic workloads, Machines are for production services). Sprites and Managed Agents are not actually in tension for this architecture; they solve different layers.

-----

## 8. “Pre-thinking” between turns: extended thinking and what’s available

Managed Agents has extended thinking **on by default**, emitted as `agent.thinking` events on the SSE stream. Adaptive thinking and explicit effort controls are configurable on the underlying Claude model. However — and this is the constraint to internalise — **thinking only happens *during* a model turn**. There is no “background reasoning” primitive. A session in `idle` is not thinking; it is consuming nothing and producing nothing. The harness only invokes the model when it has work to do, defined as “there is at least one unprocessed `user.*` event in the queue.”

So “let the agent pre-think before its turn” maps onto Managed Agents in one of three ways:

1. **Front-load thinking into the action turn itself.** When you send the YOUR-TURN message, include enough state in the prompt that Claude’s first extended-thinking block can do all the strategic reasoning needed. Sonnet with extended thinking will produce a long `agent.thinking` trace before emitting the `act` tool call. This is the simplest and probably correct default.
1. **Send a pre-turn “prepare to act” message earlier.** When the dealer can see it’ll be Claude’s turn next (e.g., the action has reached the seat immediately before this agent), push a `user.message` like `"You will likely act next. Review the hand so far and form a tentative plan; do not call act() yet."` This triggers a real model turn — Claude will produce an `agent.thinking` + `agent.message` containing its plan, which gets appended to the session log. When the real YOUR-TURN message arrives 5–15 seconds later, that planning is in-context and the action turn is cheaper. The cost is roughly one extra Claude turn per actionable hand per seat. With prompt caching this is on the order of 10–30 cents per AI seat per 50-hand game at Sonnet rates, and it directly mirrors the human cognitive pattern your research describes.
1. **Use the Outcomes feature** (in beta research preview at the time of writing).  `user.define_outcome` + rubric  can structure a hand as “decide and execute the optimal action within iteration budget K, evaluated by rubric R.” A `user.interrupt` event halts the in-flight outcome cleanly  if the table state changes underneath. This is heavier-weight than needed for individual decisions but interesting for end-of-game analysis (“write a postmortem on hand 23”).

Variant 2 is the closest analogue to “real poker thinking ahead” and is the recommended pattern if you want the *Readable Minds* qualitative behaviour to manifest most strongly. The agent’s `agent.thinking` trace before its turn is exactly the natural-language opponent model the paper measures.

-----

## Recommended architecture summary

- **Dealer** (FastAPI + PokerKit on Fly Machines, not Sprites) is the single source of truth and the only writer to the PokerKit `State` object. Exposes an MCP server on its own URL.
- **Per AI seat**: one Anthropic vault, one static_bearer credential bound to a seat-specific token, one Managed Agents session created with `vault_ids=[that_vault]`. The MCP server identifies the seat *from the bearer*, never from a tool argument.
- **Push pattern**: dealer POSTs `user.message` only on (a) hand start, (b) “it’s your turn,” (c) hand end with showdown info. The action history within the hand is delivered through `get_table_state()`’s response, not as streamed events.
- **Receive pattern**: one asyncio task per AI seat holds the SSE stream `GET /v1/sessions/{id}/events/stream`, demuxing `agent.mcp_tool_use` events for `act`/`say` and routing them back into the PokerKit state machine.
- **Human seats**: identical interface as AI seats from the dealer’s point of view, but the transport is WebSocket-to-browser and the input source is human clicks instead of tool calls.
- **Persistence for ToM**: rely on the session event log for in-game memory (sessions persist across all 50 hands as one session, which is the right unit per the *Readable Minds* result that memory is necessary and sufficient for ToM-Level-3+ behaviour).  Use Anthropic memory stores if you want cross-game opponent models.
- **Pre-turn thinking**: send an early “you may be next, form a plan” `user.message` to the next-to-act agent; extended thinking is on by default and its trace will be in-context for the eventual action turn.
- **Sprites**: not used for AI seats. Possibly useful if you later add a per-seat custom harness or want agent-side code execution beyond MCP tools, but unnecessary for the stated architecture.

The two non-obvious traps to internalise: every `user.message` costs a model turn (so push parsimoniously), and seat identity must be bearer-derived on the MCP server (so the agent can’t see another seat’s hole cards even under prompt-injection or confused-deputy conditions). Get those two right and the rest of the architecture is a fairly conventional event-driven dealer with two transport flavours.