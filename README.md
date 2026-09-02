# ClockWise

Multi-agent AI trip planner. A supervisor routes a request across specialist
agents over a shared state object, then answers — every step resumable and
traced.

**Stack:** FastAPI · LangGraph · LangMem¹ · DeepSeek V4 Flash (via an
OpenAI-compatible gateway) · React + TanStack · Langfuse · Postgres.

> ¹ The eval harness and deploy are on the roadmap — see [Scope](#scope). This
> repo currently implements **Phases 0–5**:
> `query → guardrail → load memory → supervisor → [flight ‖ hotel ‖ weather] →
> budget → itinerary → human review → final → save memory`, with the tool
> specialists running in **parallel fan-out**, a **resumable human-in-the-loop**
> approval step, and **cross-conversation memory** (LangMem-style) that
> personalizes a returning user's plan — end-to-end and traceable.
>
> Architecture diagrams: open [`clockwise-architecture.html`](./clockwise-architecture.html)
> in a browser. Full roadmap: [`clockwise-implementation-plan.md`](./clockwise-implementation-plan.md).

---

## Why it's built this way

- **Thin vertical slice first.** One request flows through every layer
  (guardrail, supervisor, a real specialist, synthesis) before any layer is
  widened. Each later phase fills in state fields that already exist.
- **Mock-first.** Every external dependency is optional. With **no API keys**
  the whole stack runs offline on frozen fixtures and deterministic LLM
  responses — which is also what the eval harness will need.
- **One model config.** Every node picks its model through
  [`llm/model_config.py`](apps/api/src/clockwise_api/llm/model_config.py). Node
  code is model-agnostic; tiering is a one-line change there.
- **Contract sync.** The backend's OpenAPI schema generates the frontend's
  typed client, so the two halves can't silently drift.
- **Checkpointer from day one.** The graph compiles with a LangGraph
  checkpointer (Postgres in prod, in-memory otherwise) — the foundation for
  resumable human-in-the-loop later.

---

## Quickstart

### Prerequisites

- [`uv`](https://docs.astral.sh/uv/) (Python), [`pnpm`](https://pnpm.io) +
  Node 22, Docker (optional, for Postgres/Langfuse).
- [`go-task`](https://taskfile.dev) is optional — every `task` command has a
  raw equivalent shown below.

### Run it (offline, zero keys)

```bash
# 1. Install deps
cd apps/api && uv sync --dev && cd ../..     # task install (also runs pnpm)
pnpm install

# 2. Backend (SQLite + in-memory checkpointer, mock LLM — no Postgres needed)
cd apps/api && uv run uvicorn clockwise_api.main:app --reload --port 8000   # task api

# 3. Frontend (separate terminal)
pnpm --filter @clockwise/web dev             # task web  ->  http://localhost:5173
```

Open http://localhost:5173, submit *"Plan a 4 day trip to Dubai next month"*,
and you'll get a weather-aware day-by-day itinerary. The badge shows
`LLM: mock` until you add keys.

### Run with real infra

```bash
cp .env.example .env          # fill in the keys you have (all optional)
docker compose up -d          # Postgres  (task up)
# add --profile langfuse for the full tracing stack:
docker compose --profile langfuse up -d
cd apps/api && uv run alembic upgrade head   # task migrate  (Postgres schema)
```

Set `DATABASE_URL` to the Postgres URL and the app automatically uses the
**Postgres checkpointer**. Set `OPENROUTER_API_KEY` to switch the LLM from mock
to live. Set `LANGFUSE_*` and each `/plan` call becomes one trace.

---

## Contract sync

The one piece of monorepo plumbing that pays for itself:

```
FastAPI (Pydantic) ──▶ openapi.json ──▶ openapi-typescript ──▶ generated.ts ──▶ TanStack Query
```

```bash
task codegen        # or:
cd apps/api && uv run python -m clockwise_api.openapi_export ../../openapi.json
pnpm run codegen    # openapi-typescript openapi.json -o apps/web/src/api/generated.ts
```

Rename a field in [`schemas.py`](apps/api/src/clockwise_api/schemas.py), run
codegen, and the frontend stops type-checking until it's updated — drift becomes
a build error, not a production bug.

---

## Commands

| Task            | `go-task`         | Raw                                                                 |
| --------------- | ----------------- | ------------------------------------------------------------------- |
| Install         | `task install`    | `cd apps/api && uv sync --dev` · `pnpm install`                     |
| Run API         | `task api`        | `cd apps/api && uv run uvicorn clockwise_api.main:app --reload`     |
| Run web         | `task web`        | `pnpm --filter @clockwise/web dev`                                  |
| Infra up        | `task up`         | `docker compose up -d`                                              |
| Migrate         | `task migrate`    | `cd apps/api && uv run alembic upgrade head`                        |
| Codegen         | `task codegen`    | see [Contract sync](#contract-sync)                                 |
| Test (backend)  | `task test`       | `cd apps/api && uv run pytest`                                      |
| Lint            | `task lint`       | `cd apps/api && uv run ruff check .` · `pnpm run lint`              |
| Typecheck       | `task typecheck`  | `cd apps/api && uv run mypy src` · `pnpm run web:typecheck`         |

Tests run fully offline on mocks — no Postgres, no keys, no network.

---

## Layout

```
apps/api    FastAPI + LangGraph backend (uv)
  src/clockwise_api/
    llm/          gateway + model_config (single source of model choice)
    graph/        TravelState, nodes (guardrail/supervisor/weather/final), build
    tools/        in-process tools + frozen fixtures
    routers/      health, conversations, plan
apps/web    React 19 + Vite + TanStack Router/Query (pnpm)
  src/api/        generated.ts (from OpenAPI) + typed client
packages/shared   shared TS constants (node/agent names)
```

---

## Scope

**Implemented (Phases 0–5):** monorepo + tooling + contract sync · FastAPI +
Postgres/SQLite + Langfuse + LLM gateway · full LangGraph orchestration —
guardrail → load memory → supervisor → **parallel** flight/hotel/weather →
budget → itinerary → **human review** → final → save memory — with a
checkpointer · in-process tools (AviationStack/Tavily/weather) with frozen
fixtures · hardened guardrail (relevance/safety/policy/validity/injection) ·
**resumable HITL** (`interrupt` + `/plan/resume` for approve / request-changes) ·
**cross-conversation memory** on LangGraph's store (per-user preferences that
personalize a returning plan) · React UI with flights, hotels, budget,
itinerary, the review step, and a memory badge.

**Memory:** LangMem-style long-term memory on LangGraph's `BaseStore`
(`InMemoryStore` locally, `AsyncPostgresStore` with Postgres — the same
substrate LangMem persists into). Preferences are namespaced per `user_id`,
loaded before planning and written back after approval. Extraction is
deterministic (offline) and routed through the gateway so it can be swapped for
LangMem's LLM extractor when live.

**Execution model:** the review pause is **synchronous + checkpoint-resumed**,
not worker-backed — `/plan` runs to the `interrupt()` and returns
`awaiting_review` (connection closes); `/plan/resume` rehydrates from the
checkpoint by `thread_id` and continues. A background worker is deferred to
Phase 8 if load demands it.

**Roadmap (Phases 6–8):** full chat + streaming UI · evaluation harness &
model-tiering experiment · Hostinger deploy. The state shape, model-tiering
hook, mock-fixture pattern, checkpointer, and store are already in place so each
phase is additive. See
[`clockwise-implementation-plan.md`](./clockwise-implementation-plan.md).
