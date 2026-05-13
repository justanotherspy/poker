# Anthropic Managed Agents — Integration Research

**Author:** Claude  
**Date:** 2026-05-13  
**Status:** Draft  
**Relates to:** JUS-54 (Claude Poker) / ongoing implementation planning

---

## 1. TL;DR

Anthropic Managed Agents is a fully-hosted agent runtime available as a beta API
(`managed-agents-2026-04-01`). The official Python SDK (`anthropic>=0.50`) covers
everything. **There is no Terraform/IaC provider**; the pattern instead is a
one-time provisioning script that creates long-lived `Agent`, `Environment`, and
`Vault` resources and stores their IDs in `.env`. Sessions are ephemeral (one per
game) and created at runtime.

For the poker game specifically:
- **One `Agent` per persona/model** — create once, store `AGENT_ID_*` in `.env`
- **One `Environment`** — create once, store `ENVIRONMENT_ID` in `.env`
- **One `Vault` with a `static_bearer` credential** pointing at our MCP server —
  create once, store `VAULT_ID` in `.env`
- **One `Session` per seat per game** — create at game start, archive at game end
- **Push table events as `user.message`** into the relevant session whenever game
  state changes or it's a seat's turn
- **Stream `agent.mcp_tool_use` events** out of each session; the dealer validates
  and applies the `act(...)` or `say(...)` call

---

## 2. Resource model

The API exposes five persistent resource types and one runtime type:

| Resource | Scope | Created when | Stored where |
|----------|-------|--------------|-------------|
| `Agent` | Workspace | Provisioning (once) | `AGENT_ID_*` in `.env` |
| `Environment` | Workspace | Provisioning (once) | `ENVIRONMENT_ID` in `.env` |
| `Vault` | Workspace | Provisioning (once) | `VAULT_ID` in `.env` |
| `Vault.Credential` | Vault | Provisioning (once) | Not stored (sub-resource) |
| `Session` | Runtime | Game start | In-memory / DB per game |
| `Events` | Session | Continuously | Append-only log on Anthropic servers |

### Key constraint

**`model`, `system`, and `tools` live only on the Agent, never on the Session.**
The session just says "run agent X in environment Y with vault Z". Getting this
wrong is the most common integration mistake.

---

## 3. The SDK

Install:

```
uv add anthropic
```

All Managed Agents functionality is under `client.beta.*`. The SDK automatically
sets the `managed-agents-2026-04-01` beta header — you don't need to set it
manually.

```python
from anthropic import Anthropic

client = Anthropic()  # reads ANTHROPIC_API_KEY from env

# Persistent resources
client.beta.agents.*
client.beta.environments.*
client.beta.vaults.*
client.beta.vaults.credentials.*

# Runtime
client.beta.sessions.*
client.beta.sessions.events.*
```

---

## 4. Provisioning (the "IaC" equivalent)

There is no Terraform provider for Managed Agents as of 2026-05-13. The
recommended pattern is a **provisioning script** (`scripts/provision_agents.py`)
that you run once per deployment environment (dev, prod). It creates the
long-lived resources and prints their IDs to copy into `.env`.

Agents are **versioned and immutable per version** — each `update()` call bumps
the version. Running sessions stay pinned to their version; new sessions get the
latest. This gives you the same rollback/A-B semantics you'd expect from IaC.

### 4.1 Create the environment

```python
environment = client.beta.environments.create(name="poker-table")
# Save: ENVIRONMENT_ID=environment.id
```

An environment is a cloud container template. For our poker agents it only needs
network access to our MCP server — no bash or filesystem tools are needed since
agents interact exclusively via MCP tool calls.

### 4.2 Create agents (one per persona/model)

```python
PERSONAS = {
    "opus_expert": {
        "model": "claude-opus-4-7",
        "system": (
            "You are an expert poker player known for precise GTO play and "
            "careful hand reading. Seat {seat}. You play conservatively, only "
            "entering pots with strong holdings, and ruthlessly exploit weak opponents."
        ),
    },
    "sonnet_balanced": {
        "model": "claude-sonnet-4-6",
        "system": (
            "You are a balanced poker player. Seat {seat}. You mix GTO ranges with "
            "exploitative adjustments based on what you observe about opponents."
        ),
    },
    "haiku_loose": {
        "model": "claude-haiku-4-5-20251001",
        "system": (
            "You are an aggressive, loose-cannon poker player. Seat {seat}. "
            "You bluff frequently, play a wide range, and apply constant pressure."
        ),
    },
}

for name, config in PERSONAS.items():
    agent = client.beta.agents.create(
        name=f"poker-{name}",
        model=config["model"],
        system=config["system"],
        # No tools here — agent uses our MCP server for all actions.
        # MCP server is declared on the agent (URL only, no credentials).
        mcp_servers=[
            {
                "type": "url",
                "name": "poker-dealer",
                "url": "https://claude-poker.fly.dev/mcp",
            }
        ],
    )
    print(f"AGENT_ID_{name.upper()}={agent.id}  # version={agent.version}")
```

The system prompt intentionally uses `{seat}` as a placeholder. At session-start
time you can't inject seat number into the agent (it lives on the Agent config,
not the session), so either:
- Create 6 seat-specific agents (6 × 3 models = 18 agents total, but reusable across games), or
- Set seat number in the first `user.message` after session creation (simpler).

The simpler approach: create 3 persona agents, then at game start send the first
`user.message` as `"You are sitting at seat N in a Texas Hold'em game. You have
{chips} chips. The other players are at seats 1–6."` This bootstraps context
without needing 18 agents.

### 4.3 Create the vault and MCP credential

Agents authenticate with our MCP server via **Vaults**. Credentials are stored
server-side in Anthropic's secret store — the agent sandbox never sees the raw
token.

```python
# Create a vault (one per "user" in the typical use case, but for poker
# one shared vault for all seats works fine since they all use the same key).
vault = client.beta.vaults.create(
    display_name="poker-table-agents",
    metadata={"purpose": "mcp-auth-for-poker-game"},
)
# Save: VAULT_ID=vault.id

# Register our MCP API key as a static bearer credential.
credential = client.beta.vaults.credentials.create(
    vault_id=vault.id,
    display_name="poker-mcp-api-key",
    auth={
        "type": "static_bearer",
        "mcp_server_url": "https://claude-poker.fly.dev/mcp",
        "token": os.environ["POKER_MCP_API_KEY"],
    },
)
# Credential ID not needed after creation; vault_id is enough at session time.
```

**How agent authentication to our MCP server works:**

1. At session creation, we pass `vault_ids=[vault.id]`.
2. When the agent makes an MCP tool call to `https://claude-poker.fly.dev/mcp`,
   Anthropic's infrastructure looks up credentials in the referenced vaults,
   matches on `mcp_server_url`, and injects `Authorization: Bearer <token>` on
   the request — **before** it reaches our server.
3. Our server's `HashedApiKeyVerifier` checks the hash of that bearer token
   against `MCP_API_KEY_HASHES`. Match → tool call proceeds. No match → 401.
4. The agent never sees the token value. The vault is write-only from the
   API perspective.

**For local dev:** Use the `MCP_DEV_TOKEN` path — the vault still works; just
set the token to your dev token value and the server accepts it via the plaintext
bypass in `auth.py`.

---

## 5. Session lifecycle — seating an agent at a table

A session is the runtime identity of an agent at a seat. Create one per seat per
game.

```python
import asyncio
from anthropic import Anthropic

client = Anthropic()

async def seat_agent(seat_number: int, agent_id: str, environment_id: str, vault_id: str) -> str:
    """Create a session for a given seat. Returns the session ID."""
    session = client.beta.sessions.create(
        agent=agent_id,               # which persona/model
        environment_id=environment_id,
        vault_ids=[vault_id],         # injects MCP auth at runtime
        title=f"Seat {seat_number} — Game {game_id}",
        # Optional: pin to a specific agent version for reproducibility
        # agent={"type": "agent", "id": agent_id, "version": 2},
    )

    # Send the seat bootstrap message. This is the first user.message and
    # starts the agent's context for the entire game.
    client.beta.sessions.events.send(
        session.id,
        events=[{
            "type": "user.message",
            "content": [{
                "type": "text",
                "text": (
                    f"You are sitting at seat {seat_number} in a 6-player "
                    f"Texas Hold'em game. You start with {STARTING_STACK} chips. "
                    f"Use the get_table_state tool to see public game state. "
                    f"When it is your turn, call the act tool to take your action."
                ),
            }],
        }],
    )

    return session.id
```

**Session statuses:**

| Status | Meaning |
|--------|---------|
| `idle` | Waiting for input — safe to push next `user.message` |
| `running` | Agent is processing |
| `rescheduling` | Transient error, retrying automatically |
| `terminated` | Unrecoverable error — create a new session |

**End of game** — archive sessions (not delete) to preserve the event log for
analysis:

```python
client.beta.sessions.archive(session_id)
```

---

## 6. Pushing table events into a running session

This is the core push mechanism. After any game state change (action taken,
cards dealt, new betting round), the dealer sends a `user.message` to every
session that should see it. Sessions that are currently `running` will receive it
after their current turn completes (the event queue is append-only).

```python
def broadcast_state_change(session_ids: list[str], event: dict) -> None:
    """Push a game event to all sessions (or a subset)."""
    text = format_event_for_agent(event)  # convert game event to natural language
    for session_id in session_ids:
        client.beta.sessions.events.send(
            session_id,
            events=[{
                "type": "user.message",
                "content": [{"type": "text", "text": text}],
            }],
        )


def notify_seat_turn(session_id: str, table_state: dict) -> None:
    """Tell a specific seat it's their turn to act."""
    client.beta.sessions.events.send(
        session_id,
        events=[{
            "type": "user.message",
            "content": [{
                "type": "text",
                "text": (
                    f"It is now your turn to act.\n\n"
                    f"Your hole cards: {table_state['hole_cards']}\n"
                    f"Board: {table_state['board']}\n"
                    f"Pot: {table_state['pot']}\n"
                    f"Your stack: {table_state['your_stack']}\n"
                    f"Amount to call: {table_state['to_call']}\n"
                    f"Action history this round: {table_state['action_history']}\n\n"
                    f"Use the act tool to take your action."
                ),
            }],
        }],
    )
```

**Important:** The agent only receives the information in the message you push.
The server is the source of truth for what each seat can see. Filter hole cards
so each agent only gets its own.

---

## 7. Streaming agent output (reading MCP tool calls)

Open a persistent SSE stream per session. The dealer listens for
`agent.mcp_tool_use` events, which fire when the agent calls `act(...)` or
`say(...)`.

```python
async def listen_to_seat(session_id: int, seat_number: int, dealer) -> None:
    """Stream events from one seat's session and apply actions to the game."""
    with client.beta.sessions.events.stream(session_id) as stream:
        for event in stream:
            if event.type == "agent.mcp_tool_use":
                tool_name = event.tool_name
                tool_input = event.input

                if tool_name == "act":
                    dealer.apply_action(
                        seat=seat_number,
                        action=tool_input["action"],
                        amount=tool_input.get("amount"),
                        bluff_declared=tool_input.get("bluff_declared", False),
                    )
                elif tool_name == "say":
                    dealer.record_chat(seat=seat_number, phrase_id=tool_input["phrase_id"])

            elif event.type == "agent.thinking":
                # Forward thinking content to the evaluation view via SSE
                dealer.emit_thinking(seat=seat_number, text=event.thinking)

            elif event.type == "session.status_idle":
                # Agent finished its turn — dealer can push the next state update
                break

            elif event.type == "session.status_terminated":
                # Session died; dealer should create a replacement session
                dealer.handle_seat_terminated(seat_number)
                break

            elif event.type == "session.error":
                # Logged but not fatal if retry_status is "retrying"
                dealer.log_session_error(seat_number, event.error)
```

### Stream reconnection

If the SSE stream drops mid-turn (network blip), the session doesn't auto-recover
without intervention — it will deadlock waiting for a `user.tool_confirmation` or
tool result that never arrives. On reconnect:

```python
# 1. Re-open the stream
# 2. Fetch full event history to find any pending tool calls
all_events = list(client.beta.sessions.events.list(session_id))
# 3. Deduplicate by event ID against already-processed events
# 4. Re-process any unhandled agent.mcp_tool_use or agent.custom_tool_use
```

---

## 8. Event types reference (what the dealer cares about)

### Inbound (dealer → agent)

| Event type | When to send |
|------------|-------------|
| `user.message` | New game state, turn notification, action results |
| `user.interrupt` | Timeout (fold on expiry), end of game |
| `user.tool_confirmation` | Only needed if you set `permission_policy: "require_confirmation"` on tools — skip for poker |

### Outbound (agent → dealer)

| Event type | Meaning |
|------------|---------|
| `agent.mcp_tool_use` | Agent is calling `act(...)` or `say(...)` — **the action** |
| `agent.mcp_tool_result` | MCP server response (tool call returned) |
| `agent.message` | Agent's prose response (useful for eval view) |
| `agent.thinking` | Extended thinking content — forward to eval view |
| `agent.thread_context_compacted` | Context was compressed; normal, log it |
| `session.status_idle` | Turn complete — safe to advance game state |
| `session.status_terminated` | Agent died — replace session |
| `span.model_request_end` | Contains token usage — log for cost tracking |

---

## 9. How the pieces connect: full flow for one action

```
Dealer (our FastAPI server)                  Managed Agents (Anthropic infra)
─────────────────────────────                ────────────────────────────────
                                             [Session for Seat 3 — idle]

1. Dealer calls notify_seat_turn(seat3_session_id, table_state)
   POST /v1/sessions/{id}/events
   {"events": [{"type": "user.message", "content": [...]}]}
                                     ──────────────────────►
                                             [session.status_running]
                                             [agent.thinking]  ← eval view
                                             [agent.mcp_tool_use]
                                             {tool: "act", input: {action: "raise",
                                              amount: 200, bluff_declared: false}}

                                     ◄── agent.mcp_tool_use event on SSE stream

2. Dealer's stream listener receives agent.mcp_tool_use
   - dealer.apply_action(seat=3, action="raise", amount=200, bluff=False)
   - PokerKit validates and applies the action
   - dealer broadcasts new state to all seats via user.message

                                     ──────────────────────►
                                             [agent.mcp_tool_result]
                                             {"result": "Raise accepted. Pot is now 420."}
                                             [session.status_idle]  ← turn done

3. Dealer advances to next seat, repeats.
```

The Anthropic infrastructure handles the round-trip from `agent.mcp_tool_use`
to `agent.mcp_tool_result` automatically — it calls our MCP server with the
injected vault credential, waits for the response, and feeds it back to the agent.
Our dealer doesn't need to manually respond to MCP tool calls; it only needs to
process the outgoing `agent.mcp_tool_use` events to update game state and
broadcast to other seats.

---

## 10. MCP server considerations

### Auth header our server sees

When a managed agent calls our MCP server, it presents:

```
Authorization: Bearer <token>
```

where `<token>` is the value stored in the vault credential. Our existing
`HashedApiKeyVerifier` in `auth.py` already handles this correctly:
- In prod: hash the token, compare against `MCP_API_KEY_HASHES`
- In dev: compare plaintext against `MCP_DEV_TOKEN`

**No code changes needed in `auth.py`** for managed agent sessions.

### What our MCP server should expose

| Tool | Purpose |
|------|---------|
| `get_table_state(seat_id: int)` | Returns filtered view: public info + own hole cards |
| `act(action, amount, bluff_declared, table_chat?)` | Mutating action — seat's move |
| `say(phrase_id: int)` | Fixed-menu table chat |

The agent gets `seat_id` from its session context (bootstrapped in the first
`user.message`). The MCP server should verify the calling seat matches the
session context — but since all seats share the same vault credential, the
server can't distinguish seats by token alone. Use a session-scoped header or
encode seat identity in the MCP call itself (the `act` tool already requires the
action, so no spoofing risk — worst case a confused agent acts out of turn and
PokerKit rejects it).

---

## 11. No IaC, but treat IDs as config

Anthropic does not publish a Terraform provider for Managed Agents. The
equivalent discipline is:

1. **`scripts/provision_agents.py`** — idempotent provisioning script.
   - Checks if named resources already exist before creating.
   - Prints IDs for `.env`.
2. **`.env` holds all provisioned IDs** — `AGENT_ID_OPUS`, `AGENT_ID_SONNET`,
   `AGENT_ID_HAIKU`, `ENVIRONMENT_ID`, `VAULT_ID`.
3. **Update agents via the API**, not by deleting and recreating. Each update
   bumps the version; old sessions keep their pinned version.
4. **Archive, don't delete** game sessions and retired agents so the event log
   is preserved for analysis.

Agent versioning gives you the same "pin to known-good, test new version in
parallel" workflow you'd get with Terraform workspaces. Archive old agent versions
by creating a new one; new sessions automatically pick it up.

---

## 12. Cost and billing

- Sessions are billed at **$0.08 / session-hour** plus normal per-token model
  charges.
- A 6-seat game running 2 hours = $0.96 in session overhead.
- Token cost dominates: Opus at 30 hands × 6 seats × ~2k tokens/action ≈ 360k
  output tokens ≈ ~$27. Budget accordingly.
- The `span.model_request_end` event includes `model_usage` (input + output tokens
  + cache read/write). Log it per session for per-game cost tracking.

---

## 13. Key things the previous research got right (and one nuance)

The JUS-54 research correctly identified Managed Agents as the right approach and
described the `user.message` push pattern. One nuance to add:

**The `user.message` push is asynchronous** — you `POST` to `/events` and it
returns `{"status": "success"}` immediately. The agent processes it in the
background. You know the agent is done when you receive `session.status_idle` on
the SSE stream. So the dealer needs both the event-push path (POST → game state
→ each session) and the event-stream path (SSE ← action detection ← each
session) running concurrently.

In practice: run one `asyncio` task per seat that owns that seat's SSE stream,
and let the dealer push events from the main game loop.

---

## 14. Next steps / open questions

1. **Provisioning script** — write `scripts/provision_agents.py`. Should be
   idempotent (check for existing resources by name before creating).
2. **`.env.example` updates** — add `AGENT_ID_OPUS`, `AGENT_ID_SONNET`,
   `AGENT_ID_HAIKU`, `ENVIRONMENT_ID`, `VAULT_ID`.
3. **Seat isolation**: decide whether to use one vault per seat or one shared
   vault. One shared vault is simpler; per-seat vaults allow per-seat credential
   rotation and better audit logs.
4. **Action timeout enforcement**: send `user.interrupt` after N seconds if
   `session.status_idle` hasn't arrived. Follow with a system message so the
   agent knows it timed out and gets a fold.
5. **`get_table_state` tool**: the agent needs a way to pull the current state on
   demand (not just when the dealer pushes it). This lets the agent re-read
   state after a long thinking chain.
6. **Concurrency model**: FastAPI + `asyncio` with one background task per active
   seat session. Or consider a message queue (Redis pubsub) to decouple the game
   loop from the SSE listener tasks.

---

## Sources

- [Claude Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Define your agent](https://platform.claude.com/docs/en/managed-agents/agent-setup)
- [Start a session](https://platform.claude.com/docs/en/managed-agents/sessions)
- [Session event stream](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)
- [Authenticate with vaults](https://platform.claude.com/docs/en/managed-agents/vaults)
- [Anthropic Python SDK — Managed Agents](https://github.com/anthropics/anthropic-sdk-python)
- [Scaling Managed Agents (Anthropic Engineering)](https://www.anthropic.com/engineering/managed-agents)
- [Anthropic Managed Agents: What It Is (Medium)](https://medium.com/@tentenco/anthropic-managed-agents-what-it-is-what-it-kills-and-why-the-timing-matters-0f70c1822f93)
- [Inside Claude Managed Agents — Pluto Security](https://pluto.security/blog/inside-claude-managed-agents/)
- [JUS-54: Research Claude Poker game idea](https://linear.app/justanotherspy/issue/JUS-54/research-claude-poker-game-idea)
