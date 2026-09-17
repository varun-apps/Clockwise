---
name: run-and-verify
description: Use to bring ClockWise up and smoke-test the /plan flow end-to-end (offline on injected test doubles, or with real infra), confirming a query returns a populated plan and — if Langfuse is configured — a single trace.
---

# Run & verify ClockWise

Confirm the slice actually works by exercising it, not just running tests.

## Quick smoke (live LLM, embedded PGlite)

```bash
cp .env.example .env   # set OPENROUTER_API_KEY (required)
cd apps/api
OPENROUTER_API_KEY=sk-... pnpm dev &        # -> http://localhost:8000

sleep 3
curl -s localhost:8000/health   # -> "llm_mode":"live"

curl -s -X POST localhost:8000/plan \
  -H 'Content-Type: application/json' \
  -d '{"query":"Plan a 4 day trip to Dubai next month"}'
# Expect: status "awaiting_review" (paused at review), weather.destination
# "Dubai", flights/hotels/budget populated, a draft itinerary_plan, summary null.
# Note conversation_id, then:
curl -s -X POST localhost:8000/plan/resume \
  -H 'Content-Type: application/json' \
  -d '{"conversation_id":"<ID>","action":"approve"}'
# Expect: status "completed" with a summary.
```

Frontend: `pnpm --filter @clockwise/web dev` → http://localhost:5173.

## With real infra

```bash
docker compose --profile langfuse up -d
cp .env.example .env   # set DATABASE_URL (Postgres), OPENROUTER_API_KEY, LANGFUSE_*
cd apps/api && pnpm dev
```

- With `DATABASE_URL` set, the app uses the **Postgres checkpointer + store**.
- With `LANGFUSE_*` set, one `/plan` call appears as a **single trace**.

## Full gate

```bash
pnpm run api:typecheck && pnpm run api:test
pnpm run lint && pnpm run web:typecheck
```

