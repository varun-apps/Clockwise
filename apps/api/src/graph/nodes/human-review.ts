import { interrupt } from "@langchain/langgraph";
import { ReviewDecisionSchema } from "../../dto.js";
import type { TravelState } from "../state.js";

/**
 * Human-in-the-loop review node. Pauses the graph after the itinerary is drafted
 * via LangGraph `interrupt()`; the checkpoint is saved and a later
 * `Command({ resume: decision })` (from /plan/resume) supplies the traveler's
 * choice as the interrupt's return value.
 */
export async function humanReviewNode(state: TravelState): Promise<Partial<TravelState>> {
  const raw = interrupt({
    type: "itinerary_review",
    itinerary_plan: state.itinerary_plan,
    budget: state.budget_analysis,
  }) as { action?: string; feedback?: string | null } | null;

  const review = ReviewDecisionSchema.parse(raw ?? {});
  const update: Partial<TravelState> = { review_decision: review };
  if (review.action === "request_changes") {
    update.revision_feedback = review.feedback ?? "";
  }
  return update;
}

export function routeAfterReview(state: TravelState): string {
  return state.review_decision?.action === "request_changes" ? "itinerary" : "final";
}
