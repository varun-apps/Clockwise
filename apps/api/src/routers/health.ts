import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute } from "@hono/zod-openapi";
import { HealthResponseSchema } from "../dto.js";
import { runtime } from "../runtime.js";

export function registerHealth(app: OpenAPIHono): void {
  const route = createRoute({
    method: "get",
    path: "/health",
    responses: {
      200: {
        content: { "application/json": { schema: HealthResponseSchema } },
        description: "Liveness + mode report",
      },
    },
  });

  app.openapi(route, (c) => {
    const { settings } = runtime();
    return c.json(
      {
        status: "ok" as const,
        env: settings.CLOCKWISE_ENV,
        llm_mode: "live" as const,
        langfuse: settings.langfuseEnabled ? ("enabled" as const) : ("disabled" as const),
      },
      200,
    );
  });
}
