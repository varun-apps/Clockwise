// Shared constants mirroring the backend graph. Keeping node/agent names in one
// place lets both apps refer to them without magic strings.

/** Graph node names, matching apps/api graph/build.py. */
export const NODES = ["guardrail", "supervisor", "weather", "final"] as const;
export type NodeName = (typeof NODES)[number];

/** Specialist agent names, matching schemas.AgentName. */
export const AGENTS = ["flight", "hotel", "weather", "budget", "itinerary"] as const;
export type AgentName = (typeof AGENTS)[number];
