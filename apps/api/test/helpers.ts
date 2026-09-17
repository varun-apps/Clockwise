import { InMemoryStore, MemorySaver } from "@langchain/langgraph";
import type { ZodType } from "zod";
import type { AppSettings } from "../src/config.js";
import { buildGraph } from "../src/graph/build.js";
import type { LLMGatewayLike, LLMObjectResult, LLMTextResult } from "../src/llm/gateway.js";
import { MemoryService } from "../src/memory.js";
import { setRuntime, type ToolService } from "../src/runtime.js";

export const QUERY = "Plan a 4 day trip to Dubai next month";

const INJECTION = /(ignore previous|system prompt|reveal your|act as|pretend to|override your)/i;
const TRAVEL = /(trip|travel|visit|vacation|holiday|flight|hotel|itinerary|weekend|days? in|plan)/i;

function extractDestination(text: string): string {
  const m = /\bto\s+([A-Z][a-z]+)/.exec(text);
  return m ? m[1] : "your destination";
}

function extractDuration(text: string): number {
  const m = /(\d+)\s*[- ]?\s*day/i.exec(text);
  return m ? Number(m[1]) : 3;
}

/**
 * Deterministic stand-in for the live LLM, used only in tests. It mirrors what
 * the real gateway returns through the contract (no network) — this is a test
 * double, not production mock mode.
 */
export class FakeGateway implements LLMGatewayLike {
  async completeText(opts: {
    node: string;
    system: string;
    prompt: string;
  }): Promise<LLMTextResult> {
    const content =
      opts.node === "final"
        ? "Here's your trip plan, with weather-aware days and a hand-picked hotel."
        : `# ${extractDuration(opts.prompt)}-Day Trip to ${extractDestination(opts.prompt)}\n\n**Day 1.** Arrive and explore.`;
    return { content, call: this.call(opts.node) };
  }

  async completeObject<T>(opts: {
    node: string;
    system: string;
    prompt: string;
    schema: ZodType<T>;
  }): Promise<LLMObjectResult<T>> {
    let data: unknown;
    switch (opts.node) {
      case "guardrail": {
        if (INJECTION.test(opts.prompt)) {
          data = { decision: "BLOCK", category: "injection", reason: "Possible prompt injection." };
        } else if (TRAVEL.test(opts.prompt)) {
          data = { decision: "PASS", category: "ok", reason: "Relevant travel request." };
        } else {
          data = { decision: "BLOCK", category: "relevance", reason: "Not about trip planning." };
        }
        break;
      }
      case "supervisor": {
        data = {
          trip_constraints: {
            destination: extractDestination(opts.prompt),
            origin: null,
            duration_days: extractDuration(opts.prompt),
            start_date: null,
            travelers: null,
            budget: null,
            notes: null,
          },
          selected_agents: ["flight", "hotel", "weather", "budget", "itinerary"],
          reasoning: "Planning the requested trip end to end.",
        };
        break;
      }
      case "budget": {
        data = {
          currency: "USD",
          flights_total: 540,
          hotels_total: 760,
          daily_estimate: 75,
          grand_total: 1600,
          notes: "Based on the cheapest flight and hotel.",
        };
        break;
      }
      case "memory": {
        data = { preferences: /beach/i.test(opts.prompt) ? ["Enjoys beach days"] : [] };
        break;
      }
      default: {
        data = {};
      }
    }
    return { data: data as T, call: this.call(opts.node) };
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Constant vector: every text is "identical", so recall returns all saved
    // preferences (cosine similarity 1.0). Deterministic and offline.
    return texts.map(() => [1, 0, 0]);
  }

  private call(node: string) {
    return { node, model: "test-model", mocked: false, prompt_tokens: 1, completion_tokens: 1 };
  }
}

export function makeSettings(): AppSettings {
  return {
    NODE_ENV: "test",
    CLOCKWISE_ENV: "test",
    CLOCKWISE_LOG_LEVEL: "info",
    CLOCKWISE_CORS_ORIGINS: "http://localhost:5173",
    DATABASE_URL: "",
    OPENROUTER_API_KEY: "test-key",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    CLOCKWISE_MODEL_DEFAULT: "deepseek/deepseek-chat",
    CLOCKWISE_MODEL_SYNTHESIS: "deepseek/deepseek-chat",
    CLOCKWISE_EMBEDDING_MODEL: "openai/text-embedding-3-small",
    CLOCKWISE_EMBEDDING_DIMS: 1536,
    AVIATIONSTACK_KEY: undefined,
    TAVILY_KEY: undefined,
    OPENWEATHERMAP_KEY: undefined,
    LANGFUSE_PUBLIC_KEY: undefined,
    LANGFUSE_SECRET_KEY: undefined,
    LANGFUSE_HOST: "http://localhost:3000",
    corsOrigins: ["http://localhost:5173"],
    postgresEnabled: false,
    langfuseEnabled: false,
  };
}

const fakeTools: ToolService = {
  getFlights: async (origin, destination) => [
    {
      airline: "Test Air",
      flight_number: "TA001",
      origin: origin ?? "Origin",
      destination: destination ?? "Anywhere",
      depart_time: "09:00",
      price: 500,
      currency: "USD",
      duration: "3h 0m",
    },
  ],
  getHotels: async (_destination, nights) => {
    const n = nights ?? 3;
    return [
      {
        name: "Test Hotel",
        area: "Central",
        rating: 4.5,
        price_per_night: 150,
        currency: "USD",
        nights: n,
        total: n * 150,
      },
    ];
  },
  getWeather: async (destination, _days) => ({
    destination: destination ?? "Anywhere",
    summary: "Sunny",
    avg_high_c: 30,
    avg_low_c: 20,
    conditions: ["clear"],
  }),
};

/** Build a fully-wired (but offline) runtime: fake gateway/tools + in-memory store. */
export function makeServices() {
  const settings = makeSettings();
  const gateway = new FakeGateway();
  const store = new InMemoryStore();
  const memory = new MemoryService(store, (texts) => gateway.embed(texts));
  const graph = buildGraph(new MemorySaver(), store);
  setRuntime({ settings, gateway, memory, graph, tools: fakeTools });
  return { settings, gateway, memory, graph, store, tools: fakeTools };
}

export function configFor(threadId: string) {
  return { configurable: { thread_id: threadId } };
}
