# Claude Poker — System Architecture

**Author:** Claude  
**Date:** 2026-05-13  
**Status:** Living document — initial draft  
**Relates to:** JUS-54, JUS-55 (implementation planning)

---

## 1. Executive Summary

Claude Poker is a Texas Hold'em table where Claude instances play each other (and optionally humans) while an evaluation view exposes every player's hole cards, streamed thinking, declared bluffs, and server-computed odds. The system splits cleanly into three layers:

| Layer | Responsibility |
|---|---|
| **Interface** | Human web UI (SSE-fed React), MCP endpoint for agents |
| **Game System** | Dealer orchestration, PokerKit rules engine, FastMCP server |
| **Data** | Game state persistence, hand history archives, session IDs |

The load-bearing design choices are: **PokerKit** as the rules engine (no re-implementing betting rounds or side pots), **Anthropic Managed Agents** as the Claude runtime (one session per seat, Anthropic handles process isolation and restart), and **external state storage** (Upstash Redis + Fly Postgres) so the Fly machine can scale to zero without losing an in-progress game.

---

## 2. Component Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Fly.io Machine (iad)                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     FastAPI (_App router)                    │   │
│  │                                                             │   │
│  │   /           → Next.js static export (StaticFiles)        │   │
│  │   /api/health → health check                               │   │
│  │   /mcp        → FastMCP ASGI app (auth-gated)              │   │
│  │   /api/sse    → SSE event stream for UI                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────┐   ┌─────────────────┐   ┌──────────────────────┐ │
│  │   Dealer    │   │   PokerKit      │   │  asyncio task pool   │ │
│  │Orchestrator │──▶│  State machine  │   │  (one per seat SSE   │ │
│  │             │   │  (State + Hand  │   │   stream listener)   │ │
│  │             │   │   History)      │   └──────────────────────┘ │
│  └──────┬──────┘   └─────────────────┘                            │
│         │                                                          │
└─────────┼──────────────────────────────────────────────────────────┘
          │
          ▼ HTTPS / SSE
┌────────────────────────┐          ┌─────────────────────────────────┐
│ Anthropic Managed      │          │         External Storage        │
│ Agents Infrastructure  │          │                                 │
│                        │          │  Upstash Redis                  │
│  Session (Seat 1)      │          │  ├── game:{id}:state           │
│  Session (Seat 2)      │          │  ├── game:{id}:sessions        │
│  Session (Seat 3)      │          │  └── game:{id}:events (pubsub) │
│  Session (Seat 4)      │          │                                 │
│  Session (Seat 5)      │          │  Fly Postgres                   │
│  Session (Seat 6)      │          │  ├── games                     │
│                        │          │  ├── hands                     │
└────────────────────────┘          │  └── seat_events               │
                                    └─────────────────────────────────┘

          ▼ SSE / WebSocket
┌────────────────────────┐
│       Browser          │
│                        │
│  /observer  — full     │
│  /seat/:id  — filtered │
└────────────────────────┘
```

---

## 3. Agent / Player Layer

### 3.1 Managed Agent resources (provisioned once)

Three **Agent** objects are created at provisioning time — one per persona/model combination. They are immutable per version; each `update()` call bumps the version and new sessions pick it up automatically.

| Agent ID env var | Model | Persona |
|---|---|---|
| `AGENT_ID_OPUS` | `claude-opus-4-7` | Expert GTO player, tight range, hand-reads opponents |
| `AGENT_ID_SONNET` | `claude-sonnet-4-6` | Balanced — mixes GTO with exploitative adjustments |
| `AGENT_ID_HAIKU` | `claude-haiku-4-5-20251001` | Loose cannon — wide range, constant aggression, fast decisions |

One **Environment** (`ENVIRONMENT_ID`) gives agents network access to the MCP server. No bash or filesystem needed — all interactions are via MCP tool calls.

One **Vault** (`VAULT_ID`) stores the MCP API key as a `static_bearer` credential. Anthropic infrastructure injects `Authorization: Bearer <token>` on every MCP call; the raw token never appears in agent context.

### 3.2 Sessions (created per game)

A **Session** is created for each occupied seat at game start. Six seats = six sessions.

```
session_id = client.beta.sessions.create(
    agent=agent_id,
    environment_id=ENVIRONMENT_ID,
    vault_ids=[VAULT_ID],
    title=f"Seat {seat} — Game {game_id}",
)
```

**Seat identity** is injected via the first `user.message` (not the Agent config, which is shared). Each seat's bootstrap message includes seat number, starting stack, opponent count, and instructions to use `get_table_state` and `act` tools.

**Session lifetime** = one game (multiple hands). This lets the agent build opponent models across hands (the "Readable Minds" finding: persistent memory is the critical enabler of theory-of-mind behaviour in LLM poker agents).

**Session statuses** the dealer must handle:

| Status | Dealer action |
|---|---|
| `idle` | Safe to push next `user.message` |
| `running` | Agent is processing; queue the next message |
| `rescheduling` | Transient error; Anthropic retries automatically |
| `terminated` | Unrecoverable — create a replacement session, replay current hand state |

**End of game** — archive (not delete) to preserve the event log for analysis.

### 3.3 Turn flow

```
Dealer                               Managed Agents (Anthropic infra)
──────                               ────────────────────────────────

1. POST /sessions/{id}/events        [Session: idle → running]
   user.message: "Your turn.         [agent.thinking] ← eval view SSE
   Hole: Ah Kd. Board: Qc Jh 2s.    [agent.mcp_tool_use]
   Pot: 300. To call: 100."            act(action="raise", amount=400,
                                         bluff_declared=false)

2. Dealer asyncio task receives
   agent.mcp_tool_use via SSE
   → PokerKit validates + applies
   → broadcast new state to all
     seats via user.message
   → push SSE event to UI

3. Anthropic infra calls our MCP     [agent.mcp_tool_result]
   server automatically (vault        {"result": "Raise accepted."}
   injects auth)                     [session.status_idle]

4. Dealer advances to next seat.
```

Key: Anthropic handles the MCP round-trip (`tool_use → call our server → tool_result`) automatically. The dealer only needs to process outgoing `agent.mcp_tool_use` events to update game state.

---

## 4. Game Engine (PokerKit)

### 4.1 State machine

`pokerkit.state.State` is a `@dataclass` that owns the full game state:

- `stacks` — chip counts per seat
- `bets` — current round bets
- `board_cards` — community cards
- `hole_cards` — per-seat hole cards (dealer controls visibility)
- `deck_cards` — remaining deck
- `status` — `True` while hand is active
- `actor_indices` — which seats can act (computed)
- Pot objects, side pots, street tracking

`State` drives a state machine via mutating methods: `deal_hole()`, `check_or_call()`, `complete_bet_or_raise_to()`, `fold()`, `collect_bets()`, `push_chips()`, `pull_chips()`. PokerKit enforces all rules and raises on invalid actions.

**Automation flags** control what PokerKit handles automatically vs what the dealer triggers manually. For our use case, we automate: ante posting, bet collection, blind posting, card burning, board dealing, chips pushing/pulling. We do **not** automate hole dealing (we control card revelation order) or hole cards showing/mucking (we time the reveal for drama).

### 4.2 MCP tools exposed by the dealer

| Tool | Args | Who calls it | Notes |
|---|---|---|---|
| `get_table_state(seat_id)` | `seat_id: int` | Any agent | Returns filtered view — own hole cards + public info only |
| `act(action, amount, bluff_declared, table_chat?)` | see below | Active seat's agent | Validated by PokerKit before applying |
| `say(phrase_id)` | `phrase_id: int` | Any agent at any time | Fixed menu of ~10 phrases; prevents prompt injection between agents |

`act` args: `action: Literal["fold","check","call","raise","bet"]`, `amount: int | None`, `bluff_declared: bool` (required — stored, revealed at showdown), `table_chat: int | None` (optional phrase ID to emit simultaneously).

The MCP server cannot distinguish seats by vault token alone (all share the same vault). Seat identity comes from the agent's own context (bootstrapped at game start). PokerKit independently validates that the acting seat is the current actor — an out-of-turn `act` call is rejected by the rules engine.

### 4.3 Server-computed analytics

EV, pot odds, outs, and hand equity are computed **server-side** using PokerKit's hand evaluation and Monte Carlo rollouts. These are never sent to the agent (it would contaminate the decision-making signal) — they appear only in the evaluation view.

---

## 5. Dealer Orchestration

The dealer is the central coordinator. It is a set of `asyncio` coroutines and background tasks that run alongside the FastAPI server.

### 5.1 Concurrency model

```
FastAPI event loop
├── /api/sse endpoint — SSE broadcaster task
├── /mcp endpoint — FastMCP request handler
└── GameOrchestrator
    ├── main_game_loop()          — hand-by-hand progression
    ├── seat_listener(seat=1)     — SSE stream for Session 1
    ├── seat_listener(seat=2)     — SSE stream for Session 2
    ├── ...
    └── seat_listener(seat=6)     — SSE stream for Session 6
```

Each `seat_listener` is a background `asyncio.Task` that holds an open SSE connection to Anthropic's `/sessions/{id}/events` stream. When `agent.mcp_tool_use` arrives, the listener notifies `main_game_loop` via an `asyncio.Queue`.

`main_game_loop` advances the hand state sequentially: deal → blinds → preflop → flop → turn → river → showdown → payout. After each state change it:
1. Persists the updated state to Redis (see §7)
2. Broadcasts relevant game events as `user.message` to all sessions
3. Pushes SSE events to the browser UI

### 5.2 Action timeout

Each seat gets `ACTION_TIMEOUT_SECONDS` (default: 60) after receiving the turn notification. The orchestrator sets an `asyncio.wait_for` on the queue read. On timeout:
1. Send `user.interrupt` to the session
2. Apply a forced fold via PokerKit
3. Emit a timeout event to the UI and all agents
4. Log the timeout (useful for per-model latency analysis)

### 5.3 Stream reconnection

If an agent SSE stream drops mid-turn, the session will deadlock waiting for a tool result. On reconnect:
1. Re-open the SSE stream from where it left off
2. Fetch full event history via `client.beta.sessions.events.list(session_id)`
3. Deduplicate by event ID against the already-processed event log
4. Re-process any unhandled `agent.mcp_tool_use` events

---

## 6. Interface Layer

### 6.1 Web UI

Two views, both fed by SSE from `/api/sse`:

**Observer view** (`/observer`) — full information:
- All hole cards revealed
- Per-seat thinking panel (streams `agent.thinking` events)
- Declared bluff flags (visible live; other agents only see them at showdown)
- Server-computed odds / EV / outs per seat
- Action history with annotations
- Per-game cost tracker (from `span.model_request_end` token counts)

**Seat view** (`/seat/:id`) — filtered information:
- Only that seat's hole cards
- Public board, pot, stacks
- Action history (bluff flags hidden until showdown)
- Table chat

Server is the source of truth for visibility. The SSE broadcaster filters events by subscriber type — a `/seat/3` subscriber never receives hole cards for seats 1, 2, 4, 5, 6.

**Stack:** Next.js (static export) + Tailwind. Served from `src/poker/static/` via FastAPI `StaticFiles`. The frontend uses `EventSource` for SSE — no WebSocket needed for this read-heavy data flow.

### 6.2 MCP endpoint

`/mcp` is the FastMCP ASGI app, auth-gated by `HashedApiKeyVerifier`. This is the surface that Managed Agent sessions call. In production, Anthropic's infrastructure injects the vault credential. In local dev, `MCP_DEV_TOKEN` bypasses hash verification.

The MCP server is stateless in the sense that it delegates all game state reads/writes to the dealer orchestrator (in-process) or to Redis (for reconstructed state after restart).

---

## 7. State Persistence — The Fly Statelessness Problem

### 7.1 The problem

Fly is configured with `auto_stop_machines = "stop"` and `min_machines_running = 0`. A machine stops when idle and restarts on the next request. All in-memory state — the `PokerKit.State` object, the `asyncio` tasks, the session ID map — is lost on stop.

For a web app serving static pages this is fine. For a long-running poker game, it is not: a 6-seat game takes 30–90 minutes, and a server restart mid-game should not abort the hand.

### 7.2 What PokerKit gives us for free

`HandHistory` (in `pokerkit.notation`) is PokerKit's serialization format (PHH — Poker Hand History). It stores:
- Full game configuration (variant, antes, blinds, starting stacks)
- Ordered action log (every `deal_hole`, `check_or_call`, `complete_bet_or_raise_to`, `fold`, etc.)

`HandHistory.dumps()` serializes to TOML text. `HandHistory.loads()` reconstructs a `State` object by replaying the action log. This means **the canonical game state is the action log, not the object graph**.

Implication: we only need to persist the action log (append-only), not a full snapshot of the `State` dataclass. Replaying 30 actions to reconstruct mid-hand state takes microseconds.

### 7.3 Storage strategy

Two external stores, both survive machine stops:

#### Upstash Redis (active game state, fast reads)

Redis is the primary store for active games. It is queried on every server startup to determine if there is an in-progress game.

```
game:{game_id}:config      HASH    game config (blinds, antes, player count, seat assignments)
game:{game_id}:sessions    HASH    seat → Managed Agent session_id
game:{game_id}:hand:{n}    STRING  PHH TOML for hand n (written once hand ends)
game:{game_id}:live_hand   STRING  PHH TOML for the current in-progress hand (updated after each action)
game:{game_id}:meta        HASH    hand_number, phase, actor_seat, started_at, status
game:{game_id}:bluffs      HASH    seat → bluff_declared (current hand only, cleared at showdown)
game:{game_id}:chat        LIST    table chat log
active_game                STRING  current game_id (or empty)
```

After every action:
1. Append action to `live_hand` PHH TOML in Redis (atomic `SET`)
2. Emit SSE to browser
3. Send `user.message` to relevant sessions

After every hand completes:
1. Move `live_hand` to `hand:{n}` (persist completed hand)
2. Write to Postgres (async, non-blocking)
3. Clear `live_hand`, increment `hand_number` in `meta`

#### Fly Postgres (durable archive)

Postgres stores completed game and hand data for analysis. It is written asynchronously and is not in the hot path.

```sql
games (
    id          TEXT PRIMARY KEY,
    config      JSONB,              -- blinds, antes, seat assignments
    started_at  TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ,
    status      TEXT                -- active | completed | abandoned
)

hands (
    id          SERIAL PRIMARY KEY,
    game_id     TEXT REFERENCES games(id),
    hand_number INT,
    phh         TEXT,              -- full PHH TOML — replayable
    started_at  TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ,
    winners     JSONB,
    pot_size    INT
)

seat_events (
    id          SERIAL PRIMARY KEY,
    game_id     TEXT REFERENCES games(id),
    hand_number INT,
    seat        INT,
    event_type  TEXT,              -- act | think | chat | timeout
    payload     JSONB,
    token_usage JSONB,             -- from span.model_request_end
    created_at  TIMESTAMPTZ
)
```

`phh` column stores the raw PHH TOML string. A completed hand can be replayed exactly by calling `HandHistory.loads(phh)` and iterating through the state machine.

### 7.4 Server restart recovery

On startup, the server runs a recovery check:

```python
async def recover_on_startup():
    game_id = await redis.get("active_game")
    if not game_id:
        return  # no active game, start fresh

    meta = await redis.hgetall(f"game:{game_id}:meta")
    if meta["status"] != "active":
        return

    # Reconstruct PokerKit state for the current hand
    phh_toml = await redis.get(f"game:{game_id}:live_hand")
    if phh_toml:
        hand_history = HandHistory.loads(phh_toml)
        state = list(hand_history)[-1]  # replay to last action → current State

    # Reload session IDs — they live in Anthropic infra, still valid
    sessions = await redis.hgetall(f"game:{game_id}:sessions")
    # seat_listeners will re-open SSE streams to these session IDs

    # Re-open seat listener tasks
    for seat, session_id in sessions.items():
        asyncio.create_task(seat_listener(int(seat), session_id))
```

**Managed Agent sessions survive the restart** — they are hosted on Anthropic's infrastructure, not on our machine. A session in `idle` state simply waits. On reconnect, we re-open the SSE stream and deduplicate against the already-processed event log. The agent's conversation history is intact.

If the restart happened mid-turn (agent was `running`), we fetch the full event history, find any unprocessed `agent.mcp_tool_use` events, and apply them before re-opening the stream.

### 7.5 Preventing scale-to-zero during active games

When a game is active we want the machine to stay up. Two options:

1. **Periodic health-check keepalive** — have the frontend poll `/api/health` every 20 seconds while a game is in progress. Fly will not stop a machine with recent HTTP traffic.
2. **`min_machines_running = 1` for the game duration** — set via Fly API when a game starts, revert to 0 when it ends. Requires a `FLY_API_TOKEN` in env. Cleaner but more complex.

Recommendation: start with option 1 (simpler), move to option 2 when we have proper game lifecycle management.

---

## 8. Session Management

### 8.1 Session lifecycle

```
Game created
    │
    ▼
seat_agent() × 6         ← creates 6 sessions, sends bootstrap user.message
    │
    ▼
main_game_loop()
    │
    ├── [hand loop]
    │       ├── deal hole cards
    │       ├── notify_seat_turn() → user.message to active seat
    │       ├── seat_listener receives agent.mcp_tool_use
    │       ├── PokerKit validates + applies
    │       ├── broadcast_state_change() → user.message to all seats
    │       └── repeat until hand ends
    │
    ├── [game ends — all chips to one seat, or manual stop]
    │
    └── archive_sessions() → client.beta.sessions.archive(session_id) × 6
                             game written to Postgres, Redis keys cleaned up
```

### 8.2 Seat identity without per-seat tokens

All seats share the same vault credential, so the MCP server cannot identify callers by token. Seat identity is maintained two ways:

1. The agent knows its seat from the bootstrap `user.message` and includes it in `act()` calls.
2. PokerKit's `actor_indices` independently validates that the calling seat is the current actor. An out-of-turn call raises a `PokerKit` error; the MCP tool returns an error result and the agent must wait.

This is sufficient for a cooperative game. If adversarial agents are ever introduced (models deliberately acting out of turn to corrupt state), add a session-scoped nonce: include a `turn_token` in the `user.message` that is required in the `act()` call, and invalidate it immediately after use.

### 8.3 Context growth and compaction

A Managed Agent session grows its context with every `user.message` received. Over a 50-hand game, this will hit token limits. Strategies in order of increasing complexity:

1. **Let Anthropic compact it** — Managed Agents fires `agent.thread_context_compacted` when it compresses older context. Log this event but don't intervene; the agent retains a compressed summary.
2. **Periodic summary injection** — after every N hands, send a `user.message` with a structured summary ("Seat 4 has folded to 3-bets 6/7 times; declared bluff twice, both times correctly"). Compresses hand-by-hand history into opponent-model-friendly facts.
3. **Session rotation** — archive the current session and create a new one, injecting the summary as the bootstrap message. This fully resets the context window but preserves the opponent model in the summary.

Start with (1) and add (2) when games regularly exceed 30 hands.

---

## 9. Hosting (Fly.io)

### 9.1 Current configuration

| Setting | Value | Notes |
|---|---|---|
| App | `claude-poker` | |
| Region | `iad` | US East — close to Anthropic API endpoints |
| Machine | default shared-cpu-1x | Sufficient for one game at a time |
| `auto_stop_machines` | `"stop"` | Stops when no traffic |
| `min_machines_running` | `0` | Scales to zero |
| Health check | `GET /api/health` every 30s | 10s grace, 5s timeout |

### 9.2 Deployment pipeline

Push to `main` → GitHub Actions `deploy.yml` → `flyctl deploy --remote-only`. The Docker build is multi-stage: (1) Bun builds the Next.js static export, (2) the Python image copies the static output and installs Python deps via `uv sync --frozen`.

### 9.3 Secrets

| Secret | Where | How |
|---|---|---|
| `ANTHROPIC_API_KEY` | Fly secrets | Managed Agents API calls |
| `MCP_API_KEY_HASHES` | Fly secrets | SHA-256 hashes of MCP bearer tokens |
| `DATABASE_URL` | Fly secrets | Fly Postgres connection string |
| `REDIS_URL` | Fly secrets | Upstash Redis connection string |
| `FLY_API_TOKEN` | GitHub Actions secret | `flyctl` in CI |

For local dev, copy `.env.example` to `.env`. Use `MCP_DEV_TOKEN` (plaintext) to bypass hash verification on the MCP endpoint.

### 9.4 Operational considerations

**Cold start latency** — the machine takes ~2–5 seconds to start from stopped state. The health check endpoint is served immediately; the dealer orchestrator connects to Redis and recovers game state as a startup task. Clients see a brief 503 during boot; the frontend should retry on SSE connection failure.

**Single machine, one game** — the current design runs one game at a time on one machine. Horizontal scaling (multiple concurrent games) requires a shared game registry in Redis and per-game routing. Defer this.

**Log retention** — Fly log drain is not configured. Add a log drain (Papertrail or Logtail) before running real games; token costs and session events are critical for post-game analysis.

---

## 10. Data Layer

### 10.1 What we store and why

| Data | Store | Reason |
|---|---|---|
| Active game state (PokerKit State as PHH TOML) | Redis | Fast restart recovery |
| Session IDs per seat | Redis | Reconnect SSE streams on restart |
| Completed hand PHH TOML | Postgres | Full replay capability |
| Per-seat event log | Postgres | Token cost, latency, bluff accuracy analysis |
| Agent thinking transcripts | Postgres (optional) | Qualitative analysis |
| Per-game cost summary | Postgres | Budget tracking |

### 10.2 PokerKit serialization in detail

`HandHistory.dumps()` serializes to a TOML string (the PHH format):
- **Config fields**: `variant`, `ante_trimming_status`, `antes`, `blinds_or_straddles`, `starting_stacks`
- **Action field**: `actions` — an ordered list of strings encoding every state transition (`"d dh p1 Ah"` = deal hole card Ace of Hearts to player 1)

To persist mid-hand state: serialize the config once (at hand start) + append each action string as it occurs. The action list is append-only and each action is a short string — serialization overhead is negligible.

To reconstruct: `HandHistory.loads(toml_str)` returns a `HandHistory` object. Iterating it (`for state in hand_history`) replays actions one by one. Take `list(hand_history)[-1]` to get the current state.

### 10.3 Bluff declarations

Bluff declarations are stored separately from the PHH (PHH doesn't have a field for this). Per-hand storage in Redis:

```
game:{game_id}:bluffs  HASH   seat_number → "true"/"false"
```

At showdown, the dealer reads this hash, emits a `bluff_reveal` SSE event with all declarations, and writes the results to `seat_events` in Postgres. The Redis key is deleted at hand start.

---

## 11. Open Problems and Mitigations

### 11.1 Managed Agents session isolation vs shared vault

**Problem:** All seats use the same vault credential. The MCP server cannot distinguish which session is calling.

**Current mitigation:** PokerKit's `actor_indices` enforces turn order. An out-of-turn `act()` call returns an error; PokerKit state is unchanged.

**Future improvement:** Session-scoped turn tokens (§8.2). Implement before any tournament-scale usage.

### 11.2 Action timeout and the fold-on-expiry contract

**Problem:** A Claude can take 20+ seconds per decision, or an SSE stream can hang.

**Mitigation:**
- `asyncio.wait_for(queue.get(), timeout=ACTION_TIMEOUT_SECONDS)` in `main_game_loop`
- On timeout: `user.interrupt` to session, forced fold via PokerKit, timeout event to all seats
- Timeout is configurable per game; set higher for Opus seats, lower for Haiku seats

### 11.3 Scale-to-zero during active games

**Problem:** Fly stops the machine when idle. A game in progress at 2am (all agents are slow) risks a stop.

**Mitigation (v1):** Frontend keepalive poll to `/api/health` every 20s during active games.

**Mitigation (v2):** Set `min_machines_running = 1` via Fly Machines API when a game transitions to `active` status. Revert to 0 at game end. Requires a management background task.

### 11.4 SSE stream reconnection mid-turn

**Problem:** If the dealer's SSE connection to Anthropic drops while an agent is `running`, the session deadlocks.

**Mitigation:**
- Exponential backoff reconnect (2s, 4s, 8s, 16s)
- On reconnect, fetch full event history, deduplicate by event ID
- Re-process unhandled `agent.mcp_tool_use` events
- If session status is `terminated`, create a replacement session and replay the current hand's action log as context

### 11.5 Context growth over long games

**Problem:** Managed Agent sessions accumulate context across hands. Token costs grow; eventually the context limit is hit.

**Mitigation:** Periodic summary injection (§8.3). Implement a hand-summary generator that compresses prior hands into opponent-model facts. Send as `user.message` every 10 hands.

**Cost ceiling:** At 30 hands × 6 Sonnet seats × ~2k output tokens/action × ~5 actions/hand = ~1.8M output tokens ≈ $27. Add Opus seats and the number doubles. Set a hard `MAX_HANDS_PER_GAME` config value and end the game gracefully.

### 11.6 Prompt injection via table chat

**Problem:** If agents could send free-form chat, one agent could inject instructions into another's context via a `user.message` containing adversarial text.

**Mitigation:** Table chat is a fixed menu of ~10 phrases (`say(phrase_id)`). The dealer looks up `phrase_id` and emits the pre-approved string. No agent-generated text ever reaches another agent's context directly.

### 11.7 Bluff declaration gaming

**Problem:** A Claude could always set `bluff_declared: false` (never declaring bluffs). The field is required by the tool schema but not enforceable semantically.

**Mitigation:** This is partly the point — if a model never declares bluffs but wins a lot of pots, that's a valid finding (conservative play). The eval view shows declaration rates per model over time. We don't penalize for not declaring.

### 11.8 Redis as a single point of failure

**Problem:** If Upstash Redis is unavailable at startup, recovery fails and the game is lost.

**Mitigation:** Upstash has built-in multi-region replication and 99.99% SLA. Additionally, write completed hand PHH TOML to Postgres synchronously (not async) as a backup. On Redis failure, the worst case is replaying completed hands from Postgres — the current in-progress hand is lost if the machine restarted without Redis.

---

## 12. Provisioning Checklist

Before the first game:

```
□ Create Fly Postgres instance: flyctl postgres create --app claude-poker
□ Create Upstash Redis instance (upstash.com) → save REDIS_URL
□ Run scripts/provision_agents.py:
    □ Creates Environment, 3 Agents, Vault, Vault Credential
    □ Prints ENVIRONMENT_ID, AGENT_ID_*, VAULT_ID for .env
□ Set Fly secrets:
    flyctl secrets set \
      ANTHROPIC_API_KEY=... \
      MCP_API_KEY_HASHES=... \
      DATABASE_URL=... \
      REDIS_URL=... \
      --app claude-poker
□ Deploy: git push → CI runs → Fly deploys
□ Smoke test: GET https://claude-poker.fly.dev/api/health → {"status":"ok"}
□ MCP auth test: POST /mcp with Bearer token → 200 (not 401)
```

---

## 13. Dependency Inventory

| Dependency | Version | Purpose |
|---|---|---|
| `pokerkit` | latest | Rules engine, hand evaluation, PHH serialization |
| `fastapi` | latest | HTTP API + SSE broadcaster |
| `fastmcp` | latest | MCP server framework |
| `uvicorn[standard]` | latest | ASGI server (includes `websockets` and `httptools`) |
| `anthropic` | ≥0.50 | Managed Agents SDK |
| `redis` | latest | Upstash Redis client (`redis.asyncio`) |
| `asyncpg` | latest | Async Postgres driver |
| `sqlalchemy[asyncio]` | latest | ORM for Postgres schema |

Frontend (not yet implemented):
| Dependency | Purpose |
|---|---|
| `next` | Static export framework |
| `react` | UI components |
| `tailwindcss` | Styling |
| `EventSource` (browser native) | SSE subscription |

---

## 14. What Is Not Built Yet

This document describes the target architecture. As of 2026-05-13, the repository contains:

- [x] FastAPI + FastMCP skeleton with auth
- [x] Next.js placeholder frontend
- [x] Docker multi-stage build
- [x] Fly.io deployment pipeline
- [ ] PokerKit integration (State, HandHistory)
- [ ] Dealer orchestrator (main_game_loop, seat_listeners)
- [ ] MCP tools (get_table_state, act, say)
- [ ] Managed Agents provisioning script
- [ ] Redis state persistence
- [ ] Fly Postgres schema and async writes
- [ ] SSE broadcaster to browser
- [ ] Observer and seat views in the frontend
- [ ] Session recovery on startup
- [ ] Action timeout enforcement
- [ ] Bluff declaration storage + showdown reveal
- [ ] Server-computed EV/odds for eval view
- [ ] Per-game cost tracking

Recommended v0 milestone: **heads-up (2 seats), one hand, terminal logs only** — validate the Managed Agents push/stream mechanism end-to-end before building the React layer.

---

## Sources

- [JUS-54 Research Report](./research-jus-54-claude-poker.md)
- [Managed Agents Integration Research](./research-managed-agents-integration.md)
- [PokerKit arXiv paper](https://arxiv.org/pdf/2308.07327)
- [Readable Minds: Emergent ToM in LLM Poker Agents](https://arxiv.org/html/2604.04157v1)
- [Anthropic Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Session event stream](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)
- [Fly.io Machines auto-stop/start](https://fly.io/docs/machines/autostop-autostart/)
- [Upstash Redis](https://upstash.com/)
