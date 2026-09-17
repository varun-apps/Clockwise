import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { RunnableConfig } from "@langchain/core/runnables";
import { Command } from "@langchain/langgraph";
import { eq } from "drizzle-orm";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";
import { getDb } from "../db.js";
import {
  type PlanRequest,
  PlanRequestSchema,
  type PlanResponse,
  PlanResponseSchema,
  type ResumeRequest,
  ResumeRequestSchema,
} from "../dto.js";
import { isPausedAtReview, planResponse } from "../graph/outcome.js";
import { getLogger } from "../logging.js";
import { type AppServices, runtime } from "../runtime.js";
import { conversations, messages } from "../schema.js";

const log = getLogger("routers.plan");
const errorSchema = z.object({ detail: z.string() });

function configFor(threadId: string): RunnableConfig {
  return { configurable: { thread_id: threadId } };
}

function decisionFor(action: ResumeRequest["action"], feedback?: string | null) {
  return action === "request_changes" ? { action, feedback: feedback ?? "" } : { action };
}

function assistantContent(resp: PlanResponse, state: Record<string, unknown>): string | null {
  if (resp.status === "blocked") return resp.blocked_reason ?? null;
  if (resp.status === "awaiting_review")
    return (state.itinerary_plan as string | undefined) ?? null;
  return (
    (state.summary as string | undefined) ?? (state.itinerary_plan as string | undefined) ?? null
  );
}

async function getOrCreateConversation(conversationId: string | null | undefined, query: string) {
  const db = getDb();
  if (conversationId) {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    return rows[0] ?? null;
  }
  const id = crypto.randomUUID();
  await db.insert(conversations).values({ id, threadId: id, title: query.slice(0, 80) });
  return { id, threadId: id };
}

async function getConversation(conversationId: string) {
  const rows = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return rows[0] ?? null;
}

async function insertMessage(conversationId: string, role: string, content: string) {
  await getDb().insert(messages).values({
    id: crypto.randomUUID(),
    conversationId,
    role,
    content,
  });
}

async function streamGraphUpdate(
  stream: SSEStreamingApi,
  graph: AppServices["graph"],
  config: RunnableConfig,
  input: Parameters<AppServices["graph"]["stream"]>[0],
  convoId: string,
  threadId: string,
): Promise<void> {
  await stream.writeSSE({
    event: "meta",
    data: JSON.stringify({ type: "meta", conversation_id: convoId, thread_id: threadId }),
  });

  try {
    const updates = await graph.stream(input, { ...config, streamMode: "updates" });
    for await (const chunk of updates) {
      for (const [nodeName, delta] of Object.entries(
        chunk as unknown as Record<string, Record<string, unknown>>,
      )) {
        if (nodeName === "__interrupt__") continue;
        const selected = delta?.selected_agents ?? null;
        await stream.writeSSE({
          event: "node",
          data: JSON.stringify({
            type: "node",
            node: nodeName,
            status: "completed",
            selected_agents: selected,
          }),
        });
      }
    }

    const snapshot = await graph.getState(config);
    const state = snapshot.values as Record<string, unknown>;
    const resp = planResponse({
      conversationId: convoId,
      threadId,
      state,
      nextNodes: snapshot.next,
    });

    const content = assistantContent(resp, state);
    if (content) await insertMessage(convoId, "assistant", content);

    await stream.writeSSE({
      event: resp.status,
      data: JSON.stringify({ type: resp.status, plan: resp }),
    });
  } catch (err) {
    log.error({ error: String(err), threadId }, "plan.stream_failed");
    await stream.writeSSE({
      event: "error",
      data: JSON.stringify({ type: "error", message: "Streaming failed." }),
    });
  }
}

export function registerPlan(app: OpenAPIHono): void {
  const planRoute = createRoute({
    method: "post",
    path: "/plan",
    request: {
      body: { content: { "application/json": { schema: PlanRequestSchema } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: PlanResponseSchema } }, description: "Plan" },
      404: { content: { "application/json": { schema: errorSchema } }, description: "Not found" },
    },
  });

  app.openapi(planRoute, async (c) => {
    const body: PlanRequest = c.req.valid("json");
    const { graph } = runtime();

    const convo = await getOrCreateConversation(body.conversation_id, body.query);
    if (!convo) return c.json({ detail: "Conversation not found" }, 404);
    await insertMessage(convo.id, "user", body.query);

    const config = configFor(convo.threadId);
    const input = {
      user_query: body.query,
      user_id: body.user_id,
      messages: [{ role: "user", content: body.query }],
    };

    await graph.invoke(input, config);
    const snapshot = await graph.getState(config);
    const resp = planResponse({
      conversationId: convo.id,
      threadId: convo.threadId,
      state: snapshot.values as Record<string, unknown>,
      nextNodes: snapshot.next,
    });

    const content = assistantContent(resp, snapshot.values as Record<string, unknown>);
    if (content) await insertMessage(convo.id, "assistant", content);
    return c.json(resp, 200);
  });

  const resumeRoute = createRoute({
    method: "post",
    path: "/plan/resume",
    request: {
      body: { content: { "application/json": { schema: ResumeRequestSchema } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: PlanResponseSchema } }, description: "Plan" },
      404: { content: { "application/json": { schema: errorSchema } }, description: "Not found" },
      409: { content: { "application/json": { schema: errorSchema } }, description: "Conflict" },
    },
  });

  app.openapi(resumeRoute, async (c) => {
    const body: ResumeRequest = c.req.valid("json");
    const { graph } = runtime();

    const convo = await getConversation(body.conversation_id);
    if (!convo) return c.json({ detail: "Conversation not found" }, 404);

    const config = configFor(convo.threadId);
    const snapshot = await graph.getState(config);
    if (!isPausedAtReview(snapshot.next)) {
      return c.json({ detail: "Conversation is not awaiting review" }, 409);
    }

    const decision = decisionFor(body.action, body.feedback);
    if (body.action === "request_changes") {
      await insertMessage(convo.id, "user", `[request changes] ${body.feedback ?? ""}`.trim());
    }

    await graph.invoke(new Command({ resume: decision }), config);
    const done = await graph.getState(config);
    const resp = planResponse({
      conversationId: convo.id,
      threadId: convo.threadId,
      state: done.values as Record<string, unknown>,
      nextNodes: done.next,
    });

    const content = assistantContent(resp, done.values as Record<string, unknown>);
    if (content) await insertMessage(convo.id, "assistant", content);
    return c.json(resp, 200);
  });

  app.post("/plan/stream", async (c) => {
    const body = PlanRequestSchema.parse(await c.req.json());
    const { graph } = runtime();

    const convo = await getOrCreateConversation(body.conversation_id, body.query);
    if (!convo) return c.json({ detail: "Conversation not found" }, 404);
    await insertMessage(convo.id, "user", body.query);

    const config = configFor(convo.threadId);
    const input = {
      user_query: body.query,
      user_id: body.user_id,
      messages: [{ role: "user", content: body.query }],
    };
    return streamSSE(c, (stream) =>
      streamGraphUpdate(stream, graph, config, input, convo.id, convo.threadId),
    );
  });

  app.post("/plan/resume/stream", async (c) => {
    const body = ResumeRequestSchema.parse(await c.req.json());
    const { graph } = runtime();

    const convo = await getConversation(body.conversation_id);
    if (!convo) return c.json({ detail: "Conversation not found" }, 404);

    const config = configFor(convo.threadId);
    const snapshot = await graph.getState(config);
    if (!isPausedAtReview(snapshot.next)) {
      return c.json({ detail: "Conversation is not awaiting review" }, 409);
    }

    const decision = decisionFor(body.action, body.feedback);
    if (body.action === "request_changes") {
      await insertMessage(convo.id, "user", `[request changes] ${body.feedback ?? ""}`.trim());
    }

    return streamSSE(c, (stream) =>
      streamGraphUpdate(
        stream,
        graph,
        config,
        new Command({ resume: decision }),
        convo.id,
        convo.threadId,
      ),
    );
  });
}
