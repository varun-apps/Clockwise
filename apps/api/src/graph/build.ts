import {
  type BaseCheckpointSaver,
  type BaseStore,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { TOOL_SPECIALISTS } from "../specialists.js";
import { budgetNode } from "./nodes/budget.js";
import { finalNode } from "./nodes/final.js";
import { flightNode } from "./nodes/flight.js";
import { guardrailNode, routeAfterGuardrail } from "./nodes/guardrail.js";
import { hotelNode } from "./nodes/hotel.js";
import { humanReviewNode, routeAfterReview } from "./nodes/human-review.js";
import { itineraryNode } from "./nodes/itinerary.js";
import { loadMemoryNode, saveMemoryNode } from "./nodes/memory.js";
import { routeToSpecialists, supervisorNode } from "./nodes/supervisor.js";
import { weatherNode } from "./nodes/weather.js";
import { TravelStateAnnotation } from "./state.js";

/**
 * Assemble the orchestration graph:
 *
 *   START -> guardrail -(PASS)-> load_memory -> supervisor -(fan-out)-> [flight|hotel|weather]
 *                       \-(BLOCK)-> END                       (parallel)  |
 *                                                                        v
 *   END <- save_memory <- final <-(approve)- human_review <- itinerary <- budget
 *                                     |                        ^
 *                                     \--(request_changes)-----/
 */
export function buildGraph(checkpointer: BaseCheckpointSaver, store?: BaseStore) {
  return new StateGraph(TravelStateAnnotation)
    .addNode("guardrail", guardrailNode)
    .addNode("load_memory", loadMemoryNode)
    .addNode("supervisor", supervisorNode)
    .addNode("flight", flightNode)
    .addNode("hotel", hotelNode)
    .addNode("weather", weatherNode)
    .addNode("budget", budgetNode)
    .addNode("itinerary", itineraryNode)
    .addNode("human_review", humanReviewNode)
    .addNode("final", finalNode)
    .addNode("save_memory", saveMemoryNode)
    .addEdge(START, "guardrail")
    .addConditionalEdges("guardrail", routeAfterGuardrail, {
      load_memory: "load_memory",
      __end__: END,
    })
    .addEdge("load_memory", "supervisor")
    .addConditionalEdges("supervisor", routeToSpecialists, {
      flight: "flight",
      hotel: "hotel",
      weather: "weather",
      budget: "budget",
    })
    .addEdge([...TOOL_SPECIALISTS], "budget")
    .addEdge("budget", "itinerary")
    .addEdge("itinerary", "human_review")
    .addConditionalEdges("human_review", routeAfterReview, {
      final: "final",
      itinerary: "itinerary",
    })
    .addEdge("final", "save_memory")
    .addEdge("save_memory", END)
    .compile({ checkpointer, store });
}
