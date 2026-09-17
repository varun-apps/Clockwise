import type { LLMCall, PlanResponse } from "../dto.js";

/** True when the graph is paused at the human_review node (snapshot.next). */
export function isPausedAtReview(nextNodes: unknown): boolean {
  return Array.isArray(nextNodes) && (nextNodes as string[]).includes("human_review");
}

/**
 * Build the terminal PlanResponse for a finished (or paused) run. `state` is the
 * authoritative graph state (snapshot.values); `nextNodes` is snapshot.next.
 */
export function planResponse(opts: {
  conversationId: string;
  threadId: string;
  state: Record<string, unknown>;
  nextNodes?: unknown;
}): PlanResponse {
  const { conversationId, threadId, state, nextNodes } = opts;
  const guardrail = state.guardrail_decision as { decision?: string; reason?: string } | undefined;
  const llmCalls = (state.llm_calls as LLMCall[] | undefined) ?? [];

  const base = {
    conversation_id: conversationId,
    thread_id: threadId,
    selected_agents: (state.selected_agents as PlanResponse["selected_agents"]) ?? [],
    flights: (state.flight_results as PlanResponse["flights"]) ?? [],
    hotels: (state.hotel_results as PlanResponse["hotels"]) ?? [],
    memory_used: (state.memory_context as string[] | undefined) ?? [],
    llm_calls: llmCalls,
    reasoning: null as string | null,
    trip_constraints: null as PlanResponse["trip_constraints"],
    weather: null as PlanResponse["weather"],
    budget: null as PlanResponse["budget"],
    itinerary_plan: null as string | null,
    summary: null as string | null,
  };

  if (guardrail?.decision === "BLOCK") {
    return {
      ...base,
      status: "blocked",
      blocked_reason: guardrail.reason || "Request blocked.",
    };
  }

  const resp: PlanResponse = {
    ...base,
    status: "completed",
    reasoning: (state.reasoning as string | undefined) ?? null,
    trip_constraints: (state.trip_constraints as PlanResponse["trip_constraints"]) ?? null,
    weather: (state.weather_info as PlanResponse["weather"]) ?? null,
    budget: (state.budget_analysis as PlanResponse["budget"]) ?? null,
    itinerary_plan: (state.itinerary_plan as string | undefined) ?? null,
    summary: (state.summary as string | undefined) ?? null,
  };

  if (isPausedAtReview(nextNodes)) {
    resp.status = "awaiting_review";
    resp.summary = null;
  }
  return resp;
}
