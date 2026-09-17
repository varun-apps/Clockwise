import type { RunnableConfig } from "@langchain/core/runnables";
import { BudgetAnalysisSchema } from "../../dto.js";
import { span } from "../../observability.js";
import type { TravelState } from "../state.js";
import { gatewayFrom } from "./context.js";

const SYSTEM = [
  "You are the budget agent for a trip planner. Given the flight and hotel options and trip",
  "constraints, produce a realistic budget as JSON with: currency, flights_total, hotels_total,",
  "daily_estimate, grand_total, notes.",
].join(" ");

export async function budgetNode(
  state: TravelState,
  config: RunnableConfig,
): Promise<Partial<TravelState>> {
  const gateway = gatewayFrom(config);
  const obs = span("node.budget");
  try {
    const { data, call } = await gateway.completeObject({
      node: "budget",
      system: SYSTEM,
      prompt: [
        `Constraints: ${JSON.stringify(state.trip_constraints ?? {})}`,
        `Flights: ${JSON.stringify(state.flight_results ?? [])}`,
        `Hotels: ${JSON.stringify(state.hotel_results ?? [])}`,
      ].join("\n"),
      schema: BudgetAnalysisSchema,
    });
    return { budget_analysis: data, llm_calls: [call] };
  } finally {
    obs?.end();
  }
}
