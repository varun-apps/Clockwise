import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { span } from "../../observability.js";
import type { TravelState } from "../state.js";
import { gatewayFrom, memoryFrom } from "./context.js";

const PreferencesSchema = z.object({
  preferences: z.array(z.string()),
});

const EXTRACTION_SYSTEM = [
  "Extract durable traveler preferences (as short statements) from the conversation.",
  'Respond as JSON: {"preferences": [..]}.',
].join(" ");

export async function loadMemoryNode(
  state: TravelState,
  config: RunnableConfig,
): Promise<Partial<TravelState>> {
  const memory = memoryFrom(config);
  const userId = state.user_id ?? "anonymous";
  const query = state.user_query ?? "";
  const obs = span("node.load_memory");
  try {
    const prefs = await memory.recall(userId, query);
    return { memory_context: prefs };
  } finally {
    obs?.end();
  }
}

export async function saveMemoryNode(
  state: TravelState,
  config: RunnableConfig,
): Promise<Partial<TravelState>> {
  const memory = memoryFrom(config);
  const gateway = gatewayFrom(config);
  const userId = state.user_id ?? "anonymous";

  const obs = span("node.save_memory");
  try {
    const sources = [
      state.user_query ?? "",
      state.revision_feedback ?? "",
      state.trip_constraints?.notes ?? "",
    ].filter(Boolean);

    const { data, call } = await gateway.completeObject({
      node: "memory",
      system: EXTRACTION_SYSTEM,
      prompt: sources.join(" | "),
      schema: PreferencesSchema,
    });

    const added = data.preferences.length ? await memory.save(userId, data.preferences) : [];
    return { memory_saved: added, llm_calls: [call] };
  } finally {
    obs?.end();
  }
}
