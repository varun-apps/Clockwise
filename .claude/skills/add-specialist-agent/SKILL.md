---
name: add-specialist-agent
description: Use when adding a new LangGraph specialist agent to ClockWise (e.g. flight, hotel, budget, itinerary) — wiring a state field, an in-process tool with a fixture, a traced node, and the graph edges, verified on mocks.
---

# Add a specialist agent

Widens the ClockWise graph from the thin slice (Phase 2) toward the full
specialist fleet (Phase 3). Follow every step; keep the change mock-first.

## Checklist

1. **State field** — in `apps/api/src/clockwise_api/graph/state.py`, confirm the
   output field exists on `TravelState` (e.g. `flight_results`). Fields that can
   be written by parallel nodes should use an additive reducer
   (`Annotated[list[...], operator.add]`).

2. **Tool + fixture** — add `tools/<name>.py` following `tools/weather.py`:
   - a pure function returning a normalized dict matching a schema in
     `schemas.py`,
   - served from `tools/fixtures/<name>.json` when the tool's API key is unset,
   - the real HTTP call guarded behind the key check.
   Freeze a representative fixture — the eval harness depends on it.

3. **Node** — add `graph/nodes/<name>.py`:
   - signature `async def <name>_node(state, config: RunnableConfig)`
     (unquoted `RunnableConfig` — a quoted forward ref breaks config injection),
   - get the gateway with `gateway_from(config)` if it needs the LLM,
   - wrap the body in `observability.span("node.<name>")`,
   - for structured output call `gateway.complete_json(node="<name>", ...,
     mock=<dict>)`; for prose `complete_text(..., mock=<str>)`,
   - append `call.as_call_record()` to `llm_calls`,
   - return only the state slice you own.
   Never hardcode a model — the node's name maps to a model in
   `llm/model_config.py`.

4. **Wire the graph** — in `graph/build.py` add the node and edges. For
   independent specialists, fan out from the supervisor and let them merge back
   into state (additive reducers make this safe); dependent nodes (budget,
   itinerary) run after their inputs are written.

5. **Model tier (optional)** — if this node needs a stronger tier, add it to the
   set in `llm/model_config.py`. Nowhere else.

6. **Test on mocks** — add a test in `apps/api/tests/` asserting the node
   populates its state field with keys unset (offline). Run:
   ```bash
   cd apps/api && uv run pytest && uv run ruff check . && uv run mypy src
   ```

7. **Verify end-to-end** — use the `run-and-verify` skill.

## Reference

The weather specialist (`tools/weather.py` + `graph/nodes/weather.py`) is the
canonical template. Copy its shape.
