# ClockWise — Implementation Plan

Multi-agent AI trip-planning system. Monorepo, Python/FastAPI backend, React + TanStack frontend, LangGraph orchestration, LangMem for long-term memory, DeepSeek V4 Flash on every node (behind an OpenAI-compatible gateway, swappable by config), self-hosted Langfuse for observability, deployed on a Hostinger VPS with the LLM external.

**Guiding principle:** build a thin vertical slice first (query → supervisor → one agent → response, traced end-to-end), then widen each layer. Don't complete any single layer in isolation. Every "decide" item below is a real open decision, not a settled one — resolve it in-phase, don't skip it.

---

## Phase 0 — Repo, tooling, contracts

**Goal:** a polyglot monorepo that builds, lints, and type-checks both apps, with a type-safe contract between them.

- [ ] Scaffold monorepo layout: `apps/web`, `apps/api`, `packages/shared` (or similar)
- [ ] **Decide** monorepo tooling — recommend lean: pnpm workspace for the JS side, `uv` for Python, a root `Taskfile`/`Makefile` to orchestrate both (Nx/Turborepo only manage the JS half, so don't over-invest there)
- [ ] Linting/formatting/typing: ruff + mypy (or pyright) for Python; ESLint/Prettier (or Biome) + TS strict for the frontend
- [ ] Pre-commit hooks, root `.env` strategy and secrets handling, gitignore
- [ ] **Contract sync** (the key monorepo win): FastAPI emits OpenAPI → generate a typed TS client (openapi-typescript / orval) consumed by TanStack Query, so FE and BE never drift
- [ ] `docker-compose` for local dev: Postgres + Langfuse + api + web
- [ ] CI skeleton (GitHub Actions): lint, type-check, test, build

**Exit:** `task dev` (or equivalent) brings up the full stack locally; a trivial FastAPI route is callable from React through the generated client.

---

## Phase 1 — Backend skeleton & infra

**Goal:** a running FastAPI app wired to Postgres, the LLM gateway, and tracing — before any agent logic exists.

- [ ] FastAPI scaffold: config, structured logging, error handling, health endpoint
- [ ] PostgreSQL + Alembic migrations; conversation persistence schema
- [ ] LLM gateway client: OpenAI-compatible, pointed at OpenRouter/DeepSeek, with a **single model-config module** (one place to set the model per node — keep node code model-agnostic)
- [ ] Wire self-hosted Langfuse tracing from day one (bake observability in, don't bolt it on later)
- [ ] Session/conversation CRUD

**Exit:** a request creates a conversation, makes one traced LLM call through the gateway, and persists.

---

## Phase 2 — Core orchestration (thin slice)

**Goal:** one request flows query → supervisor → a single agent → final response through LangGraph, resumably.

- [ ] Define `TravelState` (typed): `user_query`, `trip_constraints`, `flight_results`, `hotel_results`, `weather_info`, `budget_analysis`, `itinerary_plan`, `messages`, `llm_calls`
- [ ] Supervisor node: emits `selected_agents`, `trip_constraints`, `reasoning` as schema-valid structured output
- [ ] **Postgres checkpointer wired** — this is what later makes HITL resumable, so it's foundational, not optional
- [ ] Stub one specialist (or a mock) + a Final Response node; run the full graph end-to-end
- [ ] Expose it through FastAPI; confirm the whole path shows up as one trace in Langfuse

**Exit:** a real query returns a (thin) plan, with every node visible in a single trace.

---

## Phase 3 — Tools / MCP layer & specialist agents

**Goal:** all specialists real, reading/writing their slice of state.

- [ ] **Decide** MCP-as-servers vs in-process tools (in-process is simpler for a single box; MCP serves the portability/learning goal — pick per your priority)
- [ ] Integrate tools: AviationStack (flights), Tavily (hotels/search), Custom Weather. Key management, rate limiting, error handling, response normalization into state
- [ ] Build specialists: Flight, Hotel, Weather (tool-callers); Budget, Itinerary (pure LLM)
- [ ] **Decide + implement** fan-out: parallel vs sequential, and how results merge back into `TravelState`
- [ ] Freeze fixture/mock tool responses (needed for deterministic dev and for the eval harness — never hit live APIs in the eval loop)

**Exit:** a full query populates every state slice from real (and mockable) tools.

---

## Phase 4 — Guardrails & Human-in-the-loop

**Goal:** bad input is blocked up front; the user can approve or request changes on the itinerary.

- [ ] Input guardrail node before the supervisor: relevance / safety / policy / validity → PASS/BLOCK + reason; include prompt-injection cases
- [ ] HITL: LangGraph `interrupt` at itinerary review; API endpoints to surface the interrupted state and resume with **approve** or **request-changes** (loop back to the relevant agents)
- [ ] **Open — execution model** (the deferred topic): decide how the pause is surfaced and resumed — synchronous vs background worker, how a long-gone HTTP request reconnects. Needs its own design pass; the checkpointer from Phase 2 is the enabler
- [ ] Test HITL via API/curl first; the frontend comes in Phase 6

**Exit:** an off-topic query is blocked with a reason; a valid one pauses for review and resumes correctly on both approve and change paths.

---

## Phase 5 — Memory (LangMem)

**Goal:** cross-conversation memory informs planning.

- [ ] LangMem integration backed by Postgres
- [ ] **Decide** what's remembered (user prefs, past trips — semantic vs episodic), how it's retrieved into context, and when it's written back (after final response)
- [ ] Wire memory into the supervisor/agents so it actually changes plans

**Exit:** a returning user's stated preferences measurably shape a new plan.

---

## Phase 6 — Frontend (React + TanStack)

**Goal:** the user-facing chat and review experience.

- [ ] Scaffold: Vite + React + TanStack Router + TanStack Query, consuming the generated API client
- [ ] Chat/input surface with streaming (SSE/WebSocket) showing agent progress
- [ ] HITL review screen: render the itinerary, Approve / Request Changes, wired to the resume endpoints
- [ ] Consider TanStack Table (flight/hotel comparison) and TanStack Form (constraints)
- [ ] **Decide** auth/multi-user scope; add login/session if needed

**Exit:** a user plans a trip start-to-finish in the browser, including the approval loop.

---

## Phase 7 — Evaluation harness

**Goal:** measured evidence that decides whether Flash-everywhere holds.

- [ ] Four sub-evals: guardrail (classification, per-reason precision/recall), supervisor routing (agent-set F1 + field-level constraint accuracy + JSON validity), specialist tool-calling (BFCL-style AST match on tool/args), synthesis (programmatic sanity checks + LLM-as-judge rubric)
- [ ] Judge model = a **stronger, different** model (GLM-5.x / Qwen 3.6 Plus) to avoid Flash-grades-Flash self-preference bias
- [ ] Curated golden set, ~30–50 edge-weighted cases, as Langfuse datasets
- [ ] Run the decision experiment: Flash-everywhere vs Flash-tools + Pro-synthesis → compare synthesis rubric scores and cost-per-plan → **decide tiering**
- [ ] Optional: wire a regression gate into CI

**Exit:** the tiering question is answered with numbers on your own tasks.

---

## Phase 8 — Hardening & deploy

**Goal:** production on Hostinger.

- [ ] Resilience: retries, timeouts, rate-limit handling, graceful degradation (one agent fails → partial plan, not total failure)
- [ ] Security: secrets, input sanitization, CORS, auth hardening
- [ ] Cost/latency dashboards and per-node metrics in Langfuse
- [ ] Deploy: docker-compose on the VPS (api, worker, Postgres, Langfuse, Caddy/nginx serving built React), TLS, CI/CD; **LLM stays external**
- [ ] Smoke + light load test

**Exit:** a public URL plans a trip end-to-end, traced and within cost budget.

---

## Dependency notes

- Phase 2's checkpointer is a hard prerequisite for Phase 4's HITL — don't defer it.
- The eval harness (7) needs the mock tool fixtures from Phase 3.
- Phases 5 (memory) and 7 (eval) are largely independent of 6 (frontend) and can move in parallel if you have the bandwidth.
- Two decisions ripple widest and are worth resolving deliberately: the **execution model** (Phase 4) and **MCP vs in-process tools** (Phase 3).
