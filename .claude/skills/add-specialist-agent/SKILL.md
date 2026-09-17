---
name: add-specialist-agent
description: Use when adding a new LangGraph.js specialist agent to ClockWise (e.g. flight, hotel, budget, itinerary) — wiring a state field, an in-process tool with a fixture, a traced node, and the graph edges, verified on test doubles.
---

# Add a specialist agent

Widens the ClockWise graph toward the full specialist fleet. Follow every step.

## Checklist

1. **State field** — in `apps/api/src/graph/state.ts`, add the output channel (e.g.
   `flight_results`) to `TravelStateAnnotation`. Fields written by parallel nodes
   should use an additive reducer; single writers use a plain `Annotation<T>()`.
   Remember: a node name must **not** equal a channel name.

2. **Tool + fixture** — add `tools/<name>.ts` following `tools/weather.ts`: a pure
   function returning a normalized object matching a schema in `dto.ts`, served
   from `tools/fixtures/<name>.json` when the tool's API key is unset. Freeze a
   representative fixture.

3. **Node** — add `graph/nodes/<name>.ts`:
   - signature `async function <name>Node(state: TravelState): Promise<Partial<TravelState>>`,
   - get the LLM via `gatewayFrom(config)` if it reasons (else tool-only),
   - wrap the body in `observability.span("node.<name>")`,
   - for structured output `gateway.completeObject(node, schema, …)`, prose
     `gateway.completeText(…)`, and append `call` to `llm_calls`,
   - return only the state slice you own.
   Never hardcode a model — the node name maps to a model in `llm/model-config.ts`.

4. **Wire the graph** — in `graph/build.ts` add the node and edges. Independent
   specialists fan out from the supervisor and merge back via additive reducers;
   dependent nodes (budget, itinerary) run after their inputs.

5. **Model tier (optional)** — if the node needs the stronger tier, add it to
   `SYNTHESIS_SPECIALISTS` in `specialists.ts`.

6. **Test on doubles** — add a Vitest case in `apps/api/test/` asserting the node
   populates its state field offline. Run `pnpm run api:typecheck && pnpm run api:test`.

7. **Verify end-to-end** — use the `run-and-verify` skill.

## Reference

The weather specialist (`tools/weather.ts` + `graph/nodes/weather.ts`) is the
canonical template. Copy its shape.

