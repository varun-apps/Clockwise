# CLAUDE.md — ClockWise

Operating guide for AI agents (and humans) working in this repo. Read this
before making changes.

## What this is

Multi-agent trip planner. Node + Hono + LangGraph.js backend (`apps/api`, pnpm),
React + TanStack frontend (`apps/web`, pnpm).

```text
query -> guardrail -(PASS)-> load_memory -> supervisor -(fan-out)-> [flight|hotel|weather]
                    \-(BLOCK)-> END                          (parallel) |
                                                                        v
END <- save_memory <- final <-(approve)- human_review <- itinerary <- budget
                                     |                        ^
                                     \--(request_changes)-----/
```

## Non-negotiable rules

1. **Model choice lives in ONE place** — `apps/api/src/llm/model-config.ts`.
   Nodes ask `modelFor(node, settings)`; never hardcode a model id.
2. **Live-first, no dummy data.** The gateway and all three tools (flights,
   hotels, weather) require API keys and fail fast at boot — there is no fixture
   fallback. Tests inject doubles — they never hit live APIs.
3. **State is the only channel between nodes.** Nodes read/write `TravelState`
   (`graph/state.ts`) and nothing else.
4. **The checkpointer is not optional.** The graph always compiles with one
   (`PostgresSaver` in prod, `MemorySaver` otherwise).
5. **Even after changing `dto.ts`, run codegen.** `dto.ts` is the OpenAPI source
   of truth. `pnpm run codegen` (or `task codegen`) regenerates
   `apps/web/src/api/generated.ts`; never hand-edit it.
6. **Every node is traced.** Wrap node bodies in `observability.span(...)`; it's a
   no-op without LANGFUSE_* keys, so wrap unconditionally.

## How the graph works

- **Node/channel names must not collide.** LangGraph JS forbids a node whose name
  equals a state channel — hence `guardrail_decision` (channel) vs `guardrail`
  (node).
- Fan-out: `route_to_specialists` returns `string[]` (parallel); budget is the
  fan-in after the specialists converge.
- **HITL:** `human_review` calls `interrupt()`; `/plan` returns
  `awaiting_review` when `getState(config).next` contains `"human_review"`;
  `/plan/resume` continues with `new Command({ resume: decision })`.
- **Memory:** `MemoryService` recalls by embedding cosine similarity over a
  LangGraph store namespaced `["preferences", user_id]`; the `save_memory` node
  extracts preferences with the LLM.
- Nodes get the gateway/memory from the process singleton (`src/runtime.ts`)
  via `gatewayFrom`/`memoryFrom` — `config.configurable` only carries `thread_id`.

## SSE endpoints

`POST /plan/stream` and `/plan/resume/stream` return `text/event-stream`; their
envelope payloads are NOT OpenAPI-modeled. The frontend mirror is
`apps/web/src/api/events.ts` — keep it in sync with the `Stream*Schema` models in
`dto.ts`. The terminal event reuses `PlanResponse` verbatim.

## Before you finish

```bash
pnpm run api:typecheck && pnpm run api:test
pnpm run lint && pnpm run web:typecheck
```

All must pass.
