import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { ConversationDetailSchema, ConversationReadSchema } from "../dto.js";
import { conversations, messages } from "../schema.js";

const errorSchema = z.object({ detail: z.string() });

export function registerConversations(app: OpenAPIHono): void {
  const listRoute = createRoute({
    method: "get",
    path: "/conversations",
    responses: {
      200: {
        content: { "application/json": { schema: z.array(ConversationReadSchema) } },
        description: "List conversations",
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const rows = await getDb().select().from(conversations).orderBy(desc(conversations.updatedAt));
    return c.json(
      rows.map((r) => ({
        id: r.id,
        thread_id: r.threadId,
        title: r.title ?? null,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      })),
      200,
    );
  });

  const getRoute = createRoute({
    method: "get",
    path: "/conversations/{conversation_id}",
    request: { params: z.object({ conversation_id: z.string().uuid() }) },
    responses: {
      200: {
        content: { "application/json": { schema: ConversationDetailSchema } },
        description: "One conversation",
      },
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "Not found",
      },
    },
  });

  app.openapi(getRoute, async (c) => {
    const { conversation_id } = c.req.valid("param");
    const rows = await getDb()
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation_id))
      .limit(1);
    const convo = rows[0];
    if (!convo) return c.json({ detail: "Conversation not found" }, 404);

    const msgs = await getDb()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation_id))
      .orderBy(asc(messages.createdAt));

    return c.json(
      {
        id: convo.id,
        thread_id: convo.threadId,
        title: convo.title ?? null,
        created_at: convo.createdAt.toISOString(),
        updated_at: convo.updatedAt.toISOString(),
        messages: msgs.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.createdAt.toISOString(),
        })),
      },
      200,
    );
  });
}
