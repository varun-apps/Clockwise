import type { RunnableConfig } from "@langchain/core/runnables";
import { span } from "../../observability.js";
import type { TravelState } from "../state.js";
import { gatewayFrom } from "./context.js";

const SYSTEM = [
  "You are the final response agent for a trip planner. In 2-3 sentences, summarize the plan",
  "for the traveler: destination, length, the standout of the itinerary, and the estimated total",
  "cost. Warm and concise.",
].join(" ");

export async function finalNode(
  state: TravelState,
  config: RunnableConfig,
): Promise<Partial<TravelState>> {
  const gateway = gatewayFrom(config);
  const obs = span("node.final");
  try {
    const result = await gateway.completeText({
      node: "final",
      system: SYSTEM,
      prompt: [
        `Constraints: ${JSON.stringify(state.trip_constraints ?? {})}`,
        `Budget: ${JSON.stringify(state.budget_analysis ?? {})}`,
        `Itinerary:\n${state.itinerary_plan ?? ""}`,
      ].join("\n"),
    });
    return {
      summary: result.content,
      messages: [{ role: "assistant", content: result.content }],
      llm_calls: [result.call],
    };
  } finally {
    obs?.end();
  }
}
