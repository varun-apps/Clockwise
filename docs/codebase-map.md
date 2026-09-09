# ClockWise — Codebase Map

A reference for finding **where** each part of ClockWise lives. This is a
directory-to-responsibility map, not a tutorial: if you want to *run* the stack,
see [`../README.md`](../README.md); for the *phase roadmap*, see
[`clockwise-implementation-plan.md`](./clockwise-implementation-plan.md); for the
*state/flow diagrams*, open
[`clockwise-architecture.html`](./clockwise-architecture.html).

ClockWise is a **multi-agent AI trip planner**. A supervisor routes a free-text
request across specialist agents over a shared state object, pauses for a human
approval step, then answers — every step resumable and traced.

- **Backend:** FastAPI + LangGraph (`apps/api`, Python/`uv`)
- **Frontend:** React 19 + Vite + TanStack Router/Query (`apps/web`, pnpm)
- **Shared:** small TS constants package (`packages/shared`)
- **Docs:** this folder (`docs/`)

---

## 1. Top-level layout

| Path | Purpose |
| ---- | ------- |
| `apps/api` | FastAPI + LangGraph backend (the API, orchestration graph, LLM gateway, tools, memory, persistence) |
| `apps/web` | React frontend (chat UI, streaming client, plan/review cards) |
| `packages/shared` | Shared TypeScript constants (graph node names, agent names) |
| `docs` | Documentation (architecture diagrams, implementation plan, this map) |
| `openapi.json` | Emitted OpenAPI schema — the contract that codegen's the frontend client |
| `Taskfile.yml` | `go-task` task orchestrator (`task api`, `task codegen`, etc.) |
| `package.json` | Root pnpm scripts (`codegen`, `lint`, `web:*`) |
| `pnpm-workspace.yaml` | pnpm workspace definition (`apps/web`, `packages/*`) |
| `docker-compose.yml` | Local infra (Postgres, optional Langfuse profile) |
| `biome.json` | Frontend lint/format config |
| `CLAUDE.md` | Operating guide for agents/humans working in the repo |
| `.env.example` | Environment variable reference (all keys optional) |

---

## 2. Backend API — `apps/api/src/clockwise_api/`

The FastAPI application and every HTTP endpoint.

| File | Responsibility |
| ---- | -------------- |
| `main.py` | **App factory + lifespan.** `create_app()` builds the FastAPI app; `lifespan` wires the async DB, the LangGraph checkpointer + store (Postgres in prod, in-memory otherwise), the `LLMGateway`, `MemoryService`, and the compiled graph onto `app.state`. Registers CORS, the global error handler, and the three routers. |
| `routers/health.py` | `GET /health` — returns env, LLM mode (`live`/`mock`), Langfuse state. |
| `routers/conversations.py` | `GET /conversations` and `GET /conversations/{id}` — conversation CRUD. |
| `routers/plan.py` | **The planning endpoints** — `POST /plan`, `POST /plan/resume`, and the streaming variants `POST /plan/stream` and `POST /plan/resume/stream` (SSE). Runs the graph, maps state into `PlanResponse`, and detects the human-review pause. |
| `schemas.py` | Pydantic API models — the **single source of truth for OpenAPI**. Includes the request/response models, the domain models (`TripConstraints`, `FlightOption`, `HotelOption`, `BudgetAnalysis`, `WeatherInfo`), and the SSE envelopes (`StreamMeta`/`StreamNode`/`StreamError`/`StreamResult`). |
| `models.py` | SQLAlchemy models — `Conversation` and `Message` (persistence of chat history). |
| `config.py` | `Settings` (pydantic-settings) + `get_settings()`. Every credential optional; `llm_enabled`, `langfuse_enabled`, `db_url_async`, `cors_origins` derive from raw env. |
| `db.py` | Async SQLAlchemy engine + session factory; `get_session()` FastAPI dependency. |
| `logging.py` | Structured JSON logging via structlog. |
| `observability.py` | Langfuse tracing (`init_observability`, `span`, `flush`). `span()` is a no-op when keys are absent. |
| `openapi_export.py` | CLI that dumps `app.openapi()` to `openapi.json` (step 1 of contract sync). |
| `memory.py` | `MemoryService` (thin wrapper over a LangGraph `BaseStore`) + deterministic `extract_preferences()`. |

The router list is assembled in `main.py`:

```python
app.include_router(health.router)
app.include_router(conversations.router)
app.include_router(plan.router)
```

### Endpoints at a glance

| Endpoint | Where | What it does |
| -------- | ----- | ------------ |
| `GET /health` | `routers/health.py` | Liveness + mode report |
| `GET /conversations` | `routers/conversations.py` | List conversations |
| `GET /conversations/{id}` | `routers/conversations.py` | One conversation + messages |
| `POST /plan` | `routers/plan.py` | Run the graph to completion (or to the review pause) |
| `POST /plan/resume` | `routers/plan.py` | Resume a paused run with approve / request-changes |
| `POST /plan/stream` | `routers/plan.py` | Same as `/plan` but streams per-node progress over SSE |
| `POST /plan/resume/stream` | `routers/plan.py` | Streaming resume |

> The streaming endpoints return `text/event-stream`, so their event payloads
> are **not** part of OpenAPI and can't be codegen'd — the frontend mirrors them
> by hand in `apps/web/src/api/events.ts`.

---

## 3. Orchestration graph logic — `apps/api/src/clockwise_api/graph/`

The LangGraph orchestration. This is the heart of the multi-agent routing.

| File | Responsibility |
| ---- | -------------- |
| `graph/build.py` | **Assembles the graph.** Adds all nodes, then wires edges: `START → guardrail →(PASS)→ load_memory → supervisor →(fan-out)→ [flight ‖ hotel ‖ weather] → budget → itinerary → human_review →(approve)→ final → save_memory → END`. Compiles with the checkpointer and store. |
| `graph/state.py` | `TravelState` — the shared `TypedDict` that is the only channel between nodes. |
| `graph/nodes/__init__.py` | `gateway_from(config)` and `memory_from(config)` helpers — how nodes pull the injected gateway/memory from `config["configurable"]`. |
| `graph/nodes/guardrail.py` | Guardrail node (`PASS`/`BLOCK` classifier) + `route_after_guardrail` conditional edge (`BLOCK → END`). |
| `graph/nodes/supervisor.py` | Supervisor node (understands the request, emits `selected_agents`, `trip_constraints`, `reasoning`) + `route_to_specialists` conditional fan-out edge. |
| `graph/nodes/flight.py` | Flight tool specialist (parallel fan-out). |
| `graph/nodes/hotel.py` | Hotel tool specialist (parallel fan-out). |
| `graph/nodes/weather.py` | Weather tool specialist (parallel fan-out). |
| `graph/nodes/budget.py` | Budget synthesis specialist (LLM) — the **fan-in** node after the specialists converge. |
| `graph/nodes/itinerary.py` | Itinerary synthesis specialist (LLM) — writes the reviewable day-by-day plan. |
| `graph/nodes/human_review.py` | Human-in-the-loop node: `interrupt()` after the itinerary + `route_after_review` (approve → final, request_changes → itinerary). |
| `graph/nodes/final.py` | Final response node — writes the short `summary`. |
| `graph/nodes/memory.py` | `load_memory_node` (before planning) and `save_memory_node` (after final). |

The graph flow (mirrors the docstring in `build.py`):

```
START -> guardrail -(PASS)-> load_memory -> supervisor -(fan-out)-> [flight|hotel|weather]
                   \-(BLOCK)-> END                          (parallel)        |
                                                                               v
END <- save_memory <- final <-(approve)- human_review <- itinerary <- budget
                                     |                          ^
                                     \--(request_changes)-------/
```

**Node categories:**

- **Tool specialists** (`flight`, `hotel`, `weather`) call an in-process tool and
  do **not** use the LLM. They run in parallel fan-out.
- **LLM specialists** (`budget`, `itinerary`, `final`) call the gateway. Their
  names are in the synthesis tier in `llm/model_config.py`.
- **Routing/control nodes** (`guardrail`, `supervisor`, `human_review`) also use
  the LLM (guardrail/supervisor) or `interrupt()` (human_review).

---

## 4. AI-related code — LLM gateway, model config, memory

Everything that talks to (or stands in for) a language model.

| File | Responsibility |
| ---- | -------------- |
| `llm/gateway.py` | **`LLMGateway`** — the single OpenAI-compatible client for every node. `complete_text(...)` for prose and `complete_json(...)` for structured output. When no API key is set it returns the caller-supplied `mock` value, so the whole graph runs offline/deterministically. Records each call into `TravelState.llm_calls`. |
| `llm/model_config.py` | **`model_for(node, settings)`** — the single source of truth mapping a node to a model id. `_SYNTHESIS_NODES = {budget, itinerary, final}`. Tiering is changed only here. |
| `memory.py` | Long-term, cross-conversation memory: `MemoryService` (reads/writes a LangGraph `BaseStore` namespaced `("preferences", user_id)`) and deterministic `extract_preferences()` keyword mapping. |
| `graph/nodes/supervisor.py`, `guardrail.py`, `budget.py`, `itinerary.py`, `final.py`, `memory.py` | The LLM-calling nodes (see §3). Each asks `gateway_from(config)` and calls `gateway.complete_json` / `complete_text` with a deterministic `mock` fallback. |

**Model choice lives in ONE place** (`llm/model_config.py`). Node code is
model-agnostic — it asks `model_for(node, settings)` and never hardcodes a model id.

---

## 5. Tools — `apps/api/src/clockwise_api/tools/`

In-process tools (mock-first) plus frozen fixtures. Each follows the same pattern:
serve fixtures when the relevant API key is absent, try the live API when present,
and fall back to fixtures on any error.

| File | Responsibility |
| ---- | -------------- |
| `tools/flights.py` | `get_flights(origin, destination)` — AviationStack when `AVIATIONSTACK_KEY` is set, else frozen fixtures. |
| `tools/hotels.py` | `get_hotels(destination, nights)` — Tavily search when `TAVILY_KEY` is set, else frozen fixtures; computes per-stay totals. |
| `tools/weather.py` | `get_weather(destination)` — frozen fixtures keyed by destination (the template for future tools). |
| `tools/fixtures/` | Frozen JSON fixtures (`flights.json`, `hotels.json`, `weather.json`) used in mock mode and offline tests. |

The tool specialists (`graph/nodes/flight.py`, `hotel.py`, `weather.py`) call
these directly — they never use the LLM.

---

## 6. Frontend — `apps/web/src/`

The React chat UI and streaming client.

| Path | Responsibility |
| ---- | -------------- |
| `main.tsx` | App entry point. |
| `router.tsx` | TanStack Router route tree (`/` and `/c/$conversationId`). |
| `routes/index.tsx` | New-chat route. |
| `routes/conversation.tsx` | Per-conversation route. |
| `api/client.ts` | Typed API client — request/response shapes come from the codegen'd `generated.ts`. |
| `api/generated.ts` | **Generated** types from `openapi.json` (`task codegen`). Never edited by hand. |
| `api/events.ts` | Hand-authored mirror of the SSE envelopes (`StreamMeta`/`StreamNode`/`StreamError`/`StreamResult`) — kept in sync with `schemas.py`. |
| `api/stream.ts` | SSE client (`fetch` + `ReadableStream`) for the streaming endpoints; `parseSseFrame` parses frames. |
| `api/stream.test.ts` | Unit test for the SSE frame parser. |
| `components/chat/` | Chat UI: `chat-stream-provider.tsx` (owns the in-flight turn), `composer.tsx`, `chat-thread.tsx`, `message-bubble.tsx`, `agent-progress.tsx`, `blocked-notice.tsx`, `plan-cards.tsx`, `plan-result.tsx`, `review-panel.tsx`, `sidebar.tsx`. |
| `components/ui/` | Radix-free shadcn-style primitives (`badge`, `button`, `card`, `separator`, `skeleton`, `textarea`). |
| `components/` (root) | `app-layout.tsx`, `theme-provider.tsx`, `mode-toggle.tsx`. |
| `hooks/use-conversations.ts` | Conversation list hook. |
| `lib/utils.ts` | Small shared helpers (`cn`, etc.). |
| `index.css` | Tailwind v4 at-rules + theme tokens. |

---

## 7. Shared package — `packages/shared/`

| File | Responsibility |
| ---- | -------------- |
| `src/index.ts` | Shared constants mirroring the backend graph: `NODES` (graph node names) and `AGENTS` (specialist agent names) — keeps node/agent names in one place so both apps avoid magic strings. |

---

## 8. Cross-cutting conventions

These invariants (from `CLAUDE.md`) explain *why* code lives where it does:

1. **Model choice in one place** — `llm/model_config.py` only.
2. **Mock-first, keys optional** — everything runs offline; the gateway returns
   the `mock` value when no key is set; tools serve frozen fixtures.
3. **Never hit live APIs in tests** — tests run on fixtures + mock gateway,
   SQLite, and an in-memory checkpointer.
4. **Every node is traced** — wrap node bodies in `observability.span(...)`.
5. **After changing `schemas.py`, run codegen** — `schemas.py` is the OpenAPI
   source of truth; `generated.ts` is committed, never hand-edited.
6. **The checkpointer is not optional** — the graph always compiles with one
   (Postgres `AsyncPostgresSaver` in prod, `InMemorySaver` otherwise).
7. **State is the only channel between nodes** — nodes read/write `TravelState`
   (`graph/state.py`) and nothing else.
