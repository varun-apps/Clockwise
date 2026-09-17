import type { RunnableConfig } from "@langchain/core/runnables";
import { span } from "../../observability.js";
import type { TravelState } from "../state.js";
import { gatewayFrom } from "./context.js";

const SYSTEM = [
  "You are the itinerary agent. Using the trip constraints, weather, chosen hotel, and budget,",
  "write a concise day-by-day itinerary in Markdown. Be practical and reference the weather and",
  "the neighborhood of the hotel.",
].join(" ");

export async function itineraryNode(
  state: TravelState,
  config: RunnableConfig,
): Promise<Partial<TravelState>> {
  const gateway = gatewayFrom(config);
  const obs = span("node.itinerary");
  try {
    const result = await gateway.completeText({
      node: "itinerary",
      system: SYSTEM,
      prompt: [
        `Constraints: ${JSON.stringify(state.trip_constraints ?? {})}`,
        `Weather: ${JSON.stringify(state.weather_info ?? {})}`,
        `Hotels: ${JSON.stringify(state.hotel_results ?? [])}`,
        `Budget: ${JSON.stringify(state.budget_analysis ?? {})}`,
        `Saved traveler preferences (apply): ${JSON.stringify(state.memory_context ?? [])}`,
        `Revision feedback (apply if present): ${state.revision_feedback ?? ""}`,
      ].join("\n"),
    });
    return {
      itinerary_plan: result.content,
      messages: [{ role: "assistant", content: result.content }],
      llm_calls: [result.call],
    };
  } finally {
    obs?.end();
  }
}
