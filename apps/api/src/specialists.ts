/** Tool specialists: parallel fan-out, in-process tool, no LLM. */
export const TOOL_SPECIALISTS = ["flight", "hotel", "weather"] as const;

/** Synthesis specialists: LLM reasoning over the tool results. */
export const SYNTHESIS_SPECIALISTS = ["budget", "itinerary", "final"] as const;
