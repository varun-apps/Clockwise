import { createHash } from "node:crypto";
import type { BaseStore, Item } from "@langchain/langgraph";

export interface StoredPreference {
  content: string;
  embedding?: number[];
}

function sha1(content: string): string {
  return createHash("sha1").update(content).digest("hex").slice(0, 16);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Long-term, cross-conversation memory on a LangGraph BaseStore. Preferences are
 * stored per user under the namespace ("preferences", user_id) with an embedding
 * vector, and recalled by cosine similarity against the incoming request — real
 * semantic recall, not keyword matching. Extraction of preferences from a run is
 * done by the LLM in the save_memory node.
 */
export class MemoryService {
  constructor(
    private readonly store: BaseStore,
    private readonly embed: (texts: string[]) => Promise<number[][]>,
  ) {}

  private namespace(userId: string): string[] {
    return ["preferences", userId];
  }

  private toPreference(item: Item): StoredPreference | null {
    const value = item.value as StoredPreference | undefined;
    return typeof value?.content === "string" ? value : null;
  }

  /** Recall the preferences most relevant to the current query. */
  async recall(userId: string, query: string, limit = 8): Promise<string[]> {
    const ns = this.namespace(userId);
    const items = await this.store.search(ns, { limit: 100 });
    if (items.length === 0) return [];
    const [queryVec] = await this.embed([query]);
    if (!queryVec) return [];
    const ranked = items
      .map((item) => this.toPreference(item))
      .filter(
        (p): p is StoredPreference & { embedding: number[] } =>
          p !== null && Array.isArray(p.embedding) && p.embedding.length > 0,
      )
      .map((p) => ({ content: p.content, score: cosine(queryVec, p.embedding) }))
      .sort((a, b) => b.score - a.score);
    return ranked
      .filter((r) => r.score >= 0.35)
      .slice(0, limit)
      .map((r) => r.content);
  }

  /** Persist new preferences (idempotent by content hash); returns those added. */
  async save(userId: string, statements: string[]): Promise<string[]> {
    const ns = this.namespace(userId);
    const added: string[] = [];
    for (const statement of statements) {
      const key = sha1(statement);
      if (await this.store.get(ns, key)) continue;
      const [embedding] = await this.embed([statement]);
      if (!embedding) continue;
      await this.store.put(ns, key, { content: statement, embedding });
      added.push(statement);
    }
    return added;
  }
}
