import type { AppSettings } from "./config.js";
import type { buildGraph } from "./graph/build.js";
import type { LLMGatewayLike } from "./llm/gateway.js";
import type { MemoryService } from "./memory.js";
import type { getFlights } from "./tools/flights.js";
import type { getHotels } from "./tools/hotels.js";
import type { getWeather } from "./tools/weather.js";

export interface ToolService {
  getFlights: typeof getFlights;
  getHotels: typeof getHotels;
  getWeather: typeof getWeather;
}

export interface AppServices {
  settings: AppSettings;
  gateway: LLMGatewayLike;
  memory: MemoryService;
  graph: ReturnType<typeof buildGraph>;
  tools: ToolService;
}

let current: AppServices | undefined;

export function setRuntime(services: AppServices): void {
  current = services;
}

export function runtime(): AppServices {
  if (!current) throw new Error("ClockWise runtime is not initialized");
  return current;
}
