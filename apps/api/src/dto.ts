import { z } from "@hono/zod-openapi";

/**
 * Zod API models — the single source of truth for the OpenAPI schema (like the
 * Pydantic schemas.py it replaces). Field names are intentionally snake_case to
 * match the existing HTTP contract, so the frontend has zero churn.
 */

export const AgentNameSchema = z.enum(["flight", "hotel", "weather", "budget", "itinerary"]);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const PlanStatusSchema = z.enum(["completed", "blocked", "awaiting_review"]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const ReviewActionSchema = z.enum(["approve", "request_changes"]);
export type ReviewAction = z.infer<typeof ReviewActionSchema>;

export const GuardrailDecisionSchema = z.object({
  decision: z.enum(["PASS", "BLOCK"]).default("BLOCK"),
  category: z.string().default("ok"),
  reason: z.string().default(""),
});
export type GuardrailDecision = z.infer<typeof GuardrailDecisionSchema>;

export const ReviewDecisionSchema = z.object({
  action: z.enum(["approve", "request_changes"]).default("approve"),
  feedback: z.string().nullable().optional(),
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const HealthResponseSchema = z
  .object({
    status: z.literal("ok"),
    env: z.string(),
    llm_mode: z.enum(["live", "mock"]),
    langfuse: z.enum(["enabled", "disabled"]),
  })
  .openapi("HealthResponse");
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const TripConstraintsSchema = z.object({
  destination: z.string().nullable().optional(),
  origin: z.string().nullable().optional(),
  duration_days: z.number().int().nullable().optional(),
  start_date: z.string().nullable().optional(),
  travelers: z.number().int().nullable().optional(),
  budget: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type TripConstraints = z.infer<typeof TripConstraintsSchema>;

export const WeatherInfoSchema = z.object({
  destination: z.string(),
  summary: z.string(),
  avg_high_c: z.number().nullable().optional(),
  avg_low_c: z.number().nullable().optional(),
  conditions: z.array(z.string()).default([]),
});
export type WeatherInfo = z.infer<typeof WeatherInfoSchema>;

export const FlightOptionSchema = z.object({
  airline: z.string(),
  flight_number: z.string(),
  origin: z.string(),
  destination: z.string(),
  depart_time: z.string().nullable().optional(),
  price: z.number(),
  currency: z.string().default("USD"),
  duration: z.string().nullable().optional(),
});
export type FlightOption = z.infer<typeof FlightOptionSchema>;

export const HotelOptionSchema = z.object({
  name: z.string(),
  area: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  price_per_night: z.number(),
  currency: z.string().default("USD"),
  nights: z.number().int().nullable().optional(),
  total: z.number().nullable().optional(),
});
export type HotelOption = z.infer<typeof HotelOptionSchema>;

export const BudgetAnalysisSchema = z.object({
  currency: z.string().default("USD"),
  flights_total: z.number().nullable().optional(),
  hotels_total: z.number().nullable().optional(),
  daily_estimate: z.number().nullable().optional(),
  grand_total: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type BudgetAnalysis = z.infer<typeof BudgetAnalysisSchema>;

export const LLMCallSchema = z.object({
  node: z.string(),
  model: z.string(),
  mocked: z.boolean(),
  prompt_tokens: z.number().int().nullable().optional(),
  completion_tokens: z.number().int().nullable().optional(),
});
export type LLMCall = z.infer<typeof LLMCallSchema>;

export const PlanRequestSchema = z.object({
  query: z.string().min(1).describe("Free-text trip request"),
  conversation_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("Continue an existing conversation, or omit to start one"),
  user_id: z.string().default("anonymous").describe("Stable id used to load/save preferences"),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export const ResumeRequestSchema = z.object({
  conversation_id: z.string().uuid().describe("The paused conversation to resume"),
  action: ReviewActionSchema.describe("approve the itinerary or request changes"),
  feedback: z.string().nullable().optional().describe("What to change (when request_changes)"),
});
export type ResumeRequest = z.infer<typeof ResumeRequestSchema>;

export const PlanResponseSchema = z.object({
  conversation_id: z.string().uuid(),
  thread_id: z.string(),
  status: PlanStatusSchema,
  blocked_reason: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),
  selected_agents: z.array(AgentNameSchema).default([]),
  trip_constraints: TripConstraintsSchema.nullable().optional(),
  weather: WeatherInfoSchema.nullable().optional(),
  flights: z.array(FlightOptionSchema).default([]),
  hotels: z.array(HotelOptionSchema).default([]),
  budget: BudgetAnalysisSchema.nullable().optional(),
  itinerary_plan: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  memory_used: z.array(z.string()).default([]),
  llm_calls: z.array(LLMCallSchema).default([]),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

export const MessageReadSchema = z
  .object({
    id: z.string().uuid(),
    role: z.string(),
    content: z.string(),
    created_at: z.string(),
  })
  .openapi("MessageRead");
export type MessageRead = z.infer<typeof MessageReadSchema>;

export const ConversationReadSchema = z
  .object({
    id: z.string().uuid(),
    thread_id: z.string(),
    title: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("ConversationRead");
export type ConversationRead = z.infer<typeof ConversationReadSchema>;

export const ConversationDetailSchema = ConversationReadSchema.extend({
  messages: z.array(MessageReadSchema).default([]),
}).openapi("ConversationDetail");
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

// --- SSE streaming envelopes -------------------------------------------------
// Serialized by POST /plan/stream and /plan/resume/stream. They are NOT part of
// the OpenAPI document (text/event-stream bodies aren't modeled), so they don't
// reach the generated TS client. The frontend mirror lives in
// `apps/web/src/api/events.ts`; keep the two in sync. The terminal event reuses
// `PlanResponseSchema` verbatim so the big payload has one source of truth.

export const StreamMetaSchema = z.object({
  type: z.literal("meta"),
  conversation_id: z.string().uuid(),
  thread_id: z.string(),
});
export type StreamMeta = z.infer<typeof StreamMetaSchema>;

export const StreamNodeSchema = z.object({
  type: z.literal("node"),
  node: z.string(),
  status: z.literal("completed"),
  selected_agents: z.array(AgentNameSchema).nullable().optional(),
});
export type StreamNode = z.infer<typeof StreamNodeSchema>;

export const StreamErrorSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});
export type StreamError = z.infer<typeof StreamErrorSchema>;

export const StreamResultSchema = z.object({
  type: z.enum(["completed", "awaiting_review", "blocked"]),
  plan: PlanResponseSchema,
});
export type StreamResult = z.infer<typeof StreamResultSchema>;
