import { type LangfuseObservation, startObservation } from "@langfuse/tracing";
import { loadSettings } from "./config.js";
import { getLogger } from "./logging.js";

const log = getLogger("observability");

let enabled = false;

export function initObservability(): void {
  enabled = loadSettings().langfuseEnabled;
  log.info({ langfuse: enabled ? "enabled" : "disabled" }, "observability.initialized");
}

/**
 * Open a Langfuse observation, or a no-op when tracing is disabled. Nodes and
 * the gateway wrap every step unconditionally; without LANGFUSE_* keys this is
 * a cheap null so callers can always `span(...)`.
 */
export function span(name: string): LangfuseObservation | null {
  if (!enabled) return null;
  try {
    return startObservation(name);
  } catch {
    return null;
  }
}
