import type { RunnableConfig } from "@langchain/core/runnables";
import type { LLMGatewayLike } from "../../llm/gateway.js";
import type { MemoryService } from "../../memory.js";
import { runtime } from "../../runtime.js";

// Nodes pull the gateway/memory from the process singleton (set in bootstrap),
// so `config.configurable` stays JSON-serializable (only thread_id) and the
// compiled graph checkpoints cleanly.
export function gatewayFrom(_config: RunnableConfig): LLMGatewayLike {
  return runtime().gateway;
}

export function memoryFrom(_config: RunnableConfig): MemoryService {
  return runtime().memory;
}
