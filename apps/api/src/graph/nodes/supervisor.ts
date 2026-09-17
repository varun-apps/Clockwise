import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { AgentNameSchema, TripConstraintsSchema } from "../../dto.js";
import { span } from "../../observability.js";
import { TOOL_SPECIALISTS } from "../../specialists.js";
import type { TravelState } from "../state.js";
import { gatewayFrom } from "./context.js";

const SYSTEM = [
  "You are the supervisor of a multi-agent trip planner. Read the user's request and return JSON with:",
  "trip_constraints (destination, origin, duration_days, start_date, travelers, budget, notes),",
  "selected_agents (subset of flight, hotel, weather, budget, itinerary), and reasoning (one sentence).",
  "Only choose agents the request actually needs.",
].join(" ");

const SupervisorSchema = z.object({
  trip_constraints: TripConstraintsSchema,
  selected_agents: z.array(AgentNameSchema),
  reasoning: z.string(),
});

export async function supervisorNode(
  state: TravelState,
  config: RunnableConfig,
): Promise<Partial<TravelState>> {
  const gateway = gatewayFrom(config);
  const obs = span("node.supervisor");
  try {
    const { data, call } = await gateway.completeObject({
      node: "supervisor",
      system: SYSTEM,
      prompt: state.user_query ?? "",
      schema: SupervisorSchema,
    });
    return {
      trip_constraints: data.trip_constraints,
      selected_agents: data.selected_agents,
      reasoning: data.reasoning,
      llm_calls: [call],
    };
  } finally {
    obs?.end();
  }
}

export function routeToSpecialists(state: TravelState): string[] {
  const selected = state.selected_agents ?? [];
  const fanout = TOOL_SPECIALISTS.filter((agent) => selected.includes(agent));
  return fanout.length ? [...fanout] : ["budget"];
}
