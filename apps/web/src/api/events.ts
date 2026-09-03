// Frontend mirror of the SSE envelopes emitted by POST /plan/stream and
// /plan/resume/stream. These events are NOT part of the OpenAPI schema
// (text/event-stream bodies aren't modeled), so they can't be codegen'd — this
// union is hand-authored and MUST stay in sync with the Pydantic models in
// `apps/api/src/clockwise_api/schemas.py` (StreamMeta / StreamNode /
// StreamError / StreamResult). The terminal `plan` payload reuses the generated
// `PlanResponse` so the big object has a single source of truth (zero drift).
import type { PlanResponse } from "./client";

export type StreamMeta = {
  type: "meta";
  conversation_id: string;
  thread_id: string;
};

export type StreamNode = {
  type: "node";
  node: string;
  status: "completed";
  selected_agents?: PlanResponse["selected_agents"] | null;
};

export type StreamResult = {
  type: "completed" | "awaiting_review" | "blocked";
  plan: PlanResponse;
};

export type StreamError = {
  type: "error";
  message: string;
};

export type StreamEvent = StreamMeta | StreamNode | StreamResult | StreamError;

/** Terminal events end the stream. */
export const TERMINAL_TYPES = new Set<StreamEvent["type"]>([
  "completed",
  "awaiting_review",
  "blocked",
  "error",
]);

export function isTerminal(event: StreamEvent): event is StreamResult | StreamError {
  return TERMINAL_TYPES.has(event.type);
}
