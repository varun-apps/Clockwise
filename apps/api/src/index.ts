import { serve } from "@hono/node-server";
import { bootstrap } from "./app.js";

const { app } = await bootstrap();

const port = Number(process.env.PORT ?? 8000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ClockWise API listening on http://localhost:${info.port}`);
});
