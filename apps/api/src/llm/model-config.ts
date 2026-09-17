import type { AppSettings } from "../config.js";
import { SYNTHESIS_SPECIALISTS } from "../specialists.js";

/**
 * Single source of truth mapping each graph node to a model id. Node code stays
 * model-agnostic: it asks `modelFor(node)` and never names a model itself.
 */
export function modelFor(node: string, settings: AppSettings): string {
  return (SYNTHESIS_SPECIALISTS as readonly string[]).includes(node)
    ? settings.CLOCKWISE_MODEL_SYNTHESIS
    : settings.CLOCKWISE_MODEL_DEFAULT;
}
