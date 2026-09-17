# ClockWise — Codebase Map

A reference for finding **where** each part of ClockWise lives.

ClockWise is a **multi-agent AI trip planner**. A supervisor routes a free-text
request across specialist agents over a shared state object, pauses for a human
approval step, then answers — every step resumable and traced.

- **Backend:** Node + Hono + LangGraph.js (`apps/api`, pnpm)
- **Frontend:** React 19 + Vite + TanStack Router/Query (`apps/web`, pnpm)

---

## 1. Top-level layout

| Path | Purpose |
| ---- | ------- |
| `apps/api` | Node+Hono+LangGraph.js backend (API, orchestration graph, LLM gateway, tools, memory, persistence) |
| `apps/web` | React frontend (chat UI, streaming client, plan/review cards) |
| `openapi.json` | Emitted OpenAPI schema — the contract that codegen's the frontend client |
| `Taskfile.yml` | `go-task` orchestrator (`task api`, `task codegen`, …) |
| `package.json` | Root pnpm scripts (`api:*`, `web:*`, `codegen`, `lint`) |
| `pnpm-workspace.yaml` | pnpm workspace (`apps/web`, `apps/api`) |
| `docker-compose.yml` | Local infra (Postgres, optional Langfuse profile) |
| `biome.json` | Lint/format config (web + api) |

---

## 2. Backend — `apps/api/src/`

| File | Responsibility |
| ---- | -------------- |
| `index.ts` | Entry point — `serve` the Hono app (port from `PORT` / 8000). |
| `app.ts` | `createApp()` (CORS, error handler, routers) + `bootstrap()` (DB init, gateway, Postgres/in-memory checkpointer+store, memory, graph). |
| `config.ts` | Zod env settings + derived `postgresEnabled`/`langfuseEnabled`/`corsOrigins`; `requireOpenRouterKey()`. |
| `db.ts` | Drizzle client (`postgres` prod / embedded PGlite otherwise) + idempotent `initSchema()`. |
| `schema.ts` | Drizzle tables — `conversations`, `messages`. |
| `dto.ts` | Zod API models — the **single source of truth for OpenAPI** (incl. SSE envelopes). |
| `runtime.ts` | Process-singleton service locator (`gateway`/`memory`/`graph`/`settings`). |
| `logging.ts` | pino JSON logging. |
| `observability.ts` | Langfuse `span()` (no-op without keys). |
| `memory.ts` | `MemoryService` — embedding-based semantic recall + LLM-extracted preference save on a LangGraph store. |
| `specialists.ts` | `TOOL_SPECIALISTS` + `SYNTHESIS_SPECIALISTS`. |
| `openapi-export.ts` | CLI that dumps `app.getOpenAPIDocument()` to `openapi.json`. |

### Routers — `src/routers/`

| File | Endpoints |
| ---- | --------- |
| `health.ts` | `GET /health` (env, `llm_mode`, langfuse state). |
| `conversations.ts` | `GET /conversations`, `GET /conversations/{id}`. |
| `plan.ts` | `POST /plan`, `/plan/resume`, `/plan/stream`, `/plan/resume/stream` (SSE). |

### Orchestration — `src/graph/`

| File | Responsibility |
| ---- | -------------- |
| `state.ts` | `TravelStateAnnotation` — the shared state (additive reducers for `messages`/`llm_calls`). |
| `build.ts` | Assembles the `StateGraph` (nodes + edges + fan-out + checkpointer/store). |
| `outcome.ts` | `isPausedAtReview` + `planResponse` (terminal `PlanResponse` from `getState().values`). |
| `nodes/*` | `guardrail`, `supervisor`, `flight`, `hotel`, `weather`, `budget`, `itinerary`, `human_review`, `final`, `memory` (load/save), plus `context.ts` (singleton access helpers). |

### AI — `src/llm/`

| File | Responsibility |
| ---- | -------------- |
| `gateway.ts` | `LLMGateway` (Vercel AI SDK over OpenRouter): `completeText`, `completeObject<T>` (Zod-validated structured output), `embed`. |
| `model-config.ts` | `modelFor(node)` — the single source of model choice/tiering. |

### Tools — `src/tools/`

| File | Responsibility |
| ---- | -------------- |
| `flights.ts` / `hotels.ts` / `weather.ts` | Live-only tools (AviationStack / Tavily / OpenWeatherMap); throw if a key is missing. |

---

## 3. Frontend — `apps/web/src/`

| Path | Responsibility |
| ---- | -------------- |
| `api/generated.ts` | Generated types from `openapi.json` (`pnpm run codegen`). Never hand-edited. |
| `api/client.ts` | Typed API client derived from `generated.ts`. |
| `api/events.ts` | Hand-authored mirror of the SSE envelopes. |
| `api/stream.ts` | SSE client (`fetch` + `ReadableStream`). |
| `components/chat/` | Chat UI (stream provider, composer, thread, bubbles, plan/review cards, sidebar). |
| `routes/` | TanStack Router routes (`/`, `/c/$conversationId`). |

---

## 4. Cross-cutting invariants

1. **Model choice in one place** — `llm/model-config.ts` only.
2. **Live-first, no mock mode** — gateway requires an API key; tests inject doubles.
3. **State is the only channel** between nodes.
4. **The checkpointer is not optional.**
5. **After changing `dto.ts`, run codegen.**
6. **Node names must not collide with state channel names.**
