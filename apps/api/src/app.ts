import { OpenAPIHono } from "@hono/zod-openapi";
import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import { InMemoryStore, MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { cors } from "hono/cors";
import { loadSettings, requireApiKeys } from "./config.js";
import { initSchema } from "./db.js";
import { buildGraph } from "./graph/build.js";
import { LLMGateway } from "./llm/gateway.js";
import { configureLogging, getLogger } from "./logging.js";
import { MemoryService } from "./memory.js";
import { initObservability } from "./observability.js";
import { registerConversations } from "./routers/conversations.js";
import { registerHealth } from "./routers/health.js";
import { registerPlan } from "./routers/plan.js";
import { type AppServices, setRuntime } from "./runtime.js";
import { getFlights } from "./tools/flights.js";
import { getHotels } from "./tools/hotels.js";
import { getWeather } from "./tools/weather.js";

const log = getLogger("app");

export function createApp(): OpenAPIHono {
  const settings = loadSettings();
  const app = new OpenAPIHono();

  app.use(
    "*",
    cors({
      origin: settings.corsOrigins,
      allowMethods: ["*"],
      allowHeaders: ["*"],
      credentials: true,
    }),
  );

  app.onError((err, c) => {
    log.error({ error: String(err) }, "unhandled_error");
    return c.json({ detail: "Internal server error" }, 500);
  });

  registerHealth(app);
  registerConversations(app);
  registerPlan(app);

  return app;
}

export async function bootstrap(): Promise<{ app: OpenAPIHono; services: AppServices }> {
  const settings = loadSettings();
  requireApiKeys(settings); // fail fast at boot — no dummy-data fallback
  configureLogging();
  initObservability();
  await initSchema();

  const gateway = new LLMGateway(settings);

  let checkpointer: BaseCheckpointSaver;
  let store: BaseStore;
  if (settings.postgresEnabled) {
    const saver = PostgresSaver.fromConnString(settings.DATABASE_URL);
    await saver.setup();
    const pgStore = PostgresStore.fromConnString(settings.DATABASE_URL);
    await pgStore.setup();
    checkpointer = saver;
    store = pgStore;
  } else {
    checkpointer = new MemorySaver();
    store = new InMemoryStore();
  }

  const memory = new MemoryService(store, (texts) => gateway.embed(texts));
  const graph = buildGraph(checkpointer, store);

  const services: AppServices = {
    settings,
    gateway,
    memory,
    graph,
    tools: { getFlights, getHotels, getWeather },
  };
  setRuntime(services);

  return { app: createApp(), services };
}
