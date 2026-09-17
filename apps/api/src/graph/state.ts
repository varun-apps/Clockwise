import { Annotation } from "@langchain/langgraph";
import type {
  AgentName,
  BudgetAnalysis,
  FlightOption,
  GuardrailDecision,
  HotelOption,
  LLMCall,
  ReviewDecision,
  TripConstraints,
  WeatherInfo,
} from "../dto.js";

export interface ChatMessage {
  role: string;
  content: string;
}

/**
 * TravelState — the shared object that is the only channel between nodes.
 * `messages` and `llm_calls` use additive reducers so parallel fan-out merges
 * cleanly; every other field is a last-value channel written by one node.
 */
export const TravelStateAnnotation = Annotation.Root({
  user_query: Annotation<string>,
  user_id: Annotation<string>,

  // Long-term memory (loaded from / written to the store).
  memory_context: Annotation<string[]>,
  memory_saved: Annotation<string[]>,

  // Guardrail.
  guardrail_decision: Annotation<GuardrailDecision>,

  // Supervisor.
  trip_constraints: Annotation<TripConstraints>,
  selected_agents: Annotation<AgentName[]>,
  reasoning: Annotation<string>,

  // Specialist outputs.
  flight_results: Annotation<FlightOption[]>,
  hotel_results: Annotation<HotelOption[]>,
  weather_info: Annotation<WeatherInfo>,
  budget_analysis: Annotation<BudgetAnalysis>,
  itinerary_plan: Annotation<string>,
  summary: Annotation<string>,

  // Human-in-the-loop review.
  review_decision: Annotation<ReviewDecision>,
  revision_feedback: Annotation<string>,

  // Cross-cutting.
  messages: Annotation<ChatMessage[]>({
    reducer: (a, b) => (a ?? []).concat(b ?? []),
    default: () => [],
  }),
  llm_calls: Annotation<LLMCall[]>({
    reducer: (a, b) => (a ?? []).concat(b ?? []),
    default: () => [],
  }),
});

export type TravelState = typeof TravelStateAnnotation.State;
