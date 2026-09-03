# CLAUDE.md — ClockWise

Operating guide for AI agents (and humans) working in this repo. Read this
before making changes.

## What this is

Multi-agent trip planner. FastAPI + LangGraph backend (`apps/api`, Python/uv),
React + TanStack frontend (`apps/web`, pnpm). Currently **Phases 0–6**:
`query → guardrail → load_memory → supervisor → [flight ‖ hotel ‖ weather] →
budget → itinerary → human_review → final → save_memory`, with parallel
fan-out, a resumable human-in-the-loop approval step, and cross-conversation
memory. **Phase 6** adds the frontend: a streaming chat UI (SSE endpoints
`POST /plan/stream` + `/plan/resume/stream` driving `graph.astream`) with live
per-node progress, structured plan cards, the approve / request-changes review
loop, a conversation sidebar, and Tailwind v4 + shadcn-style theming. Full plan
in `clockwise-implementation-plan.md`; diagrams in `clockwise-architecture.html`.

## Frontend notes (Phase 6)

- **SSE events aren't in OpenAPI.** The streaming endpoints return
  `text/event-stream`, so their event payloads can't be codegen'd. The Pydantic
  envelopes (`StreamMeta/StreamNode/StreamError/StreamResult` in `schemas.py`)
  and the hand-authored FE union (`apps/web/src/api/events.ts`) are mirrors —
  keep them in sync. The terminal event reuses `PlanResponse` (zero drift).
- **Streaming generator must not use the request session.** A `StreamingResponse`
  body runs after the endpoint returns, so `_stream_graph` commits the
  conversation/user message first, then opens a fresh session via
  `get_sessionmaker()` for the post-run assistant write.
- **Interrupt detection = `aget_state().next` contains `"human_review"`**, not
  chunk string-matching. Build the terminal `PlanResponse` from
  `aget_state().values` — never hand-merge astream deltas.
- **Streaming is kicked off only from event handlers**, never `useEffect`
  (StrictMode guard). `ChatStreamProvider` owns the in-flight turn at layout
  level so it survives the `index → /c/$id` navigation.
- shadcn components under `apps/web/src/components/ui/` are Radix-free and
  biome-ignored; `src/index.css` (Tailwind v4 at-rules) is biome-ignored too.

## Non-negotiable rules

1. **Model choice lives in ONE place** —
   `apps/api/src/clockwise_api/llm/model_config.py`. Nodes ask
   `model_for(node, settings)`; they must never hardcode a model id. Tiering is
   changed only there.
2. **Mock-first, keys optional.** Everything must run offline with no API keys.
   The `LLMGateway` returns the caller-supplied `mock` value when no key is set;
   tools serve frozen fixtures. Never make a node hard-require a live service.
3. **Never hit live APIs in tests.** Tests run on fixtures + mock gateway, with
   SQLite and an in-memory checkpointer. No network, no Postgres, no keys.
4. **Every node is traced.** Wrap node bodies in `observability.span(...)`; the
   gateway already traces each call. Tracing is a no-op without Langfuse keys,
   so wrap unconditionally.
5. **After changing `schemas.py`, run codegen.** `schemas.py` is the OpenAPI
   source of truth. Run `task codegen` (or the two raw commands in the README)
   and fix any frontend type errors — that's the contract-sync guardrail
   working as intended. `generated.ts` is committed; never edit it by hand.
6. **The checkpointer is not optional.** The graph always compiles with one
   (`AsyncPostgresSaver` on Postgres, `InMemorySaver` otherwise). It's the
   foundation for Phase 4 HITL — don't remove it.
7. **State is the only channel between nodes.** Nodes read/write `TravelState`
   (`graph/state.py`) and nothing else. Keep field names aligned with the
   TravelState table in `clockwise-architecture.html`.

## How the graph works

- `graph/build.py` wires `START → guardrail →(PASS)→ supervisor →(fan-out)→
  [flight ‖ hotel ‖ weather] → budget → itinerary → final → END`; guardrail
  `BLOCK` routes straight to `END`.
- **Fan-out/fan-in:** the supervisor's `route_to_specialists` conditional edge
  schedules only the selected tool specialists (they run in parallel); each has
  an edge to `budget`, which runs once after they converge (fan-in). Parallel
  writes are safe because each specialist owns a distinct state key, and
  `messages`/`llm_calls` use additive reducers.
- **Tool specialists** (flight/hotel/weather) call an in-process tool and don't
  use the LLM. **LLM specialists** (budget/itinerary/final) call the gateway;
  their node names are in the synthesis tier in `model_config.py`.
- **HITL:** `human_review` calls `interrupt()` after itinerary. `/plan` detects
  the pause via `"__interrupt__" in state` and returns `awaiting_review`;
  `/plan/resume` continues with `Command(resume={"action": ...})`. Approve →
  final; request_changes → loop back to itinerary with `revision_feedback`.
  Resume is checkpoint-based (works across separate requests); never hold a
  connection open across the pause.
- **Memory:** long-term preferences live in a LangGraph `BaseStore`
  (`InMemoryStore`/`AsyncPostgresStore`), namespaced `("preferences", user_id)`.
  `load_memory` reads them into `memory_context` before planning; `save_memory`
  extracts + persists after approval. Nodes get the `MemoryService` via
  `config["configurable"]["memory"]` (like the gateway) — inject it in every
  graph invoke. Extraction lives in `memory.py::extract_preferences` (keep it
  deterministic so tests run offline).
- Nodes get the gateway via `config["configurable"]["gateway"]` (see
  `graph/nodes/__init__.py::gateway_from`) — they never construct a client.
- Node functions must be `async def node(state, config: RunnableConfig)` with an
  **unquoted** `RunnableConfig` annotation (a quoted forward-ref breaks
  LangGraph's config injection).
- Structured node outputs use `gateway.complete_json(..., mock=<dict>)`; prose
  uses `gateway.complete_text(..., mock=<str>)`. The `mock` is what runs
  offline, so make it a sensible deterministic value.

## Adding a specialist / regenerating the client

Use the project skills in `.claude/skills/`:
`add-specialist-agent`, `contract-sync`, `run-and-verify`.

## Before you finish

Run and confirm green:

```bash
cd apps/api && uv run ruff check . && uv run mypy src && uv run pytest
cd ../.. && pnpm run lint && pnpm run web:typecheck
```

Tests, ruff, mypy, biome, and the web typecheck must all pass. Verify behavior
by actually running the slice (see the `run-and-verify` skill), not just tests.
