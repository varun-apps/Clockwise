# ClockWise

Multi-agent AI trip planner. A supervisor routes a free-text request across
specialist agents over a shared state object, pauses for a human approval step,
then answers — every step resumable and traced.

**Stack:** Node.js + Hono · LangGraph.js · LangMem-style semantic memory · DeepSeek
(via an OpenAI-compatible gateway) · React 19 + TanStack · Langfuse · Postgres.

---

## What this is

```text
query -> guardrail -> load_memory -> supervisor -> [flight || hotel || weather]
                                                          (parallel fan-out)
                                                     v
save_memory <- final <-(approve)- human_review <- itinerary <- budget
                          |                     ^
                          \--(request_changes)---/
```

The supervisor fans out to the selected tool specialists in parallel; budget is
the fan-in; itinerary drafts the reviewable plan; a resumable human-in-the-loop
step pauses for approval; and cross-conversation memory (embedding-based semantic
recall) personalizes a returning user's plan. A guardrail BLOCK short-circuits
to END.

---

## Why it's built this way

- **Live-first.** There is no dummy-data fallback: the LLM gateway and all three
  tools (flights, hotels, weather) call their live APIs and are required at
  startup — the app refuses to boot otherwise. The test suite injects doubles
  instead, keeping tests offline.
- **One model config.** Every node picks its model through
  `apps/api/src/llm/model-config.ts`. Node code is model-agnostic.
- **Real memory.** Long-term preferences are extracted by the LLM and recalled by
  embedding similarity (LangMem-style) on a LangGraph store, namespaced per user.
- **Checkpointer from day one.** The graph always compiles with one (Postgres in
  prod, in-memory otherwise) — the foundation for resumable human-in-the-loop.
- **Contract sync.** The backend's OpenAPI schema generates the frontend's typed
  client, so the two halves can't silently drift.

---

## Quickstart

Prerequisites: [pnpm](https://pnpm.io) + Node 22. Docker is optional (Postgres/
Langfuse).

### API keys

| Key | Required | Used for |
| --- | -------- | -------- |
| `OPENROUTER_API_KEY` | ✅ Yes | The live LLM gateway (chat + embeddings). Get one at [openrouter.ai](https://openrouter.ai). |
| `AVIATIONSTACK_KEY` | ✅ Yes | Live flight search. Get one at [aviationstack.com](https://aviationstack.com). |
| `TAVILY_KEY` | ✅ Yes | Live hotel search. Get one at [tavily.com](https://tavily.com). |
| `OPENWEATHERMAP_KEY` | ✅ Yes | Live weather. Get one at [openweathermap.org](https://openweathermap.org/api). |
| `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` | No | Langfuse tracing (optional — unset just disables tracing, not data). |

ClockWise runs **live-only**: it refuses to start if any required key is missing —
there is no sample/fixture data fallback anywhere. (Only the test suite injects
doubles, which is why tests run offline.)

```bash
pnpm install
cp .env.example .env            # set OPENROUTER_API_KEY (required)

# Backend (embedded PGlite + in-memory checkpointer, live LLM)
pnpm --filter @clockwise/api dev      # -> http://localhost:8000

# Frontend (separate terminal)
pnpm --filter @clockwise/web dev      # -> http://localhost:5173
```

Open http://localhost:5173 and submit *"Plan a 4 day trip to Dubai next month"*.
The badge reads `LLM: live` when a key is set.

### Run with real infra (Postgres)

```bash
docker compose up -d            # Postgres (add --profile langfuse for tracing)
# set DATABASE_URL=postgresql://clockwise:clockwise@localhost:5432/clockwise
pnpm --filter @clockwise/api dev
```

With `DATABASE_URL` set, the app uses the **Postgres checkpointer + memory store**
and persists conversations. Set `LANGFUSE_*` and every `/plan` call becomes one
trace.

---

## Contract sync

```bash
pnpm --filter @clockwise/api exec tsx src/openapi-export.ts ../../openapi.json
pnpm run codegen                 # openapi-typescript -> apps/web/src/api/generated.ts
pnpm run web:typecheck
```

`task codegen` runs both steps. `generated.ts` is committed, never hand-edited.

---

## Commands

| Task            | `go-task`     | Raw                                             |
| --------------- | ------------- | ----------------------------------------------- |
| Install         | `task install`| `pnpm install`                                  |
| Run API         | `task api`    | `pnpm --filter @clockwise/api dev`              |
| Run web         | `task web`    | `pnpm --filter @clockwise/web dev`              |
| Infra up        | `task up`     | `docker compose up -d`                          |
| Codegen         | `task codegen`| see [Contract sync](#contract-sync)             |
| Test (backend)  | `task test`   | `pnpm --filter @clockwise/api test`             |
| Lint            | `task lint`   | `pnpm run lint`                                 |
| Typecheck       | `task typecheck` | `pnpm run api:typecheck && pnpm run web:typecheck` |

Tests run fully offline on injected test doubles — no keys, no Postgres, no
network.

---

## Layout

```text
apps/api    Node + Hono + LangGraph.js backend (pnpm)
  src/config.ts       env settings (Zod); postgresEnabled, langfuseEnabled
  src/db.ts           Drizzle client (Postgres driver / embedded PGlite)
  src/schema.ts       Drizzle tables (conversations, messages)
  src/dto.ts          Zod API models — the OpenAPI source of truth
  src/runtime.ts      process singleton service locator (gateway/memory/graph)
  src/memory.ts       MemoryService (LLM extraction + embedding recall)
  src/llm/            gateway (Vercel AI SDK) + model-config
  src/graph/          TravelState, nodes (guardrail/supervisor/...), build, outcome
  src/routers/        health, conversations, plan (+ SSE streaming)
  src/tools/          flights/hotels/weather (live APIs)
apps/web    React 19 + Vite + TanStack Router/Query (pnpm)
```
