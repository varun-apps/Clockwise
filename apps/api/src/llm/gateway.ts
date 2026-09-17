import { createOpenAICompatible, type OpenAICompatibleProvider } from "@ai-sdk/openai-compatible";
import { generateObject, generateText } from "ai";
import type { z } from "zod";
import type { AppSettings } from "../config.js";
import type { LLMCall } from "../dto.js";
import { span } from "../observability.js";
import { modelFor } from "./model-config.js";

export interface LLMTextResult {
  content: string;
  call: LLMCall;
}

export interface LLMObjectResult<T> {
  data: T;
  call: LLMCall;
}

/**
 * The single live LLM gateway (Vercel AI SDK over OpenRouter's OpenAI-compatible
 * API). There is no mock mode — startup fails fast if the API key is missing.
 */
export interface LLMGatewayLike {
  completeText(opts: { node: string; system: string; prompt: string }): Promise<LLMTextResult>;
  completeObject<T>(opts: {
    node: string;
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<LLMObjectResult<T>>;
  embed(texts: string[]): Promise<number[][]>;
}

export class LLMGateway implements LLMGatewayLike {
  private readonly provider: OpenAICompatibleProvider;

  constructor(private readonly settings: AppSettings) {
    this.provider = createOpenAICompatible({
      name: "openrouter",
      baseURL: settings.OPENROUTER_BASE_URL,
      apiKey: settings.OPENROUTER_API_KEY,
    });
  }

  private modelForNode(node: string) {
    const id = modelFor(node, this.settings);
    return { id, model: this.provider.chatModel(id) };
  }

  async completeText(opts: {
    node: string;
    system: string;
    prompt: string;
  }): Promise<LLMTextResult> {
    const { id, model } = this.modelForNode(opts.node);
    const obs = span(`llm.${opts.node}`);
    try {
      const result = await generateText({
        model,
        system: opts.system,
        prompt: opts.prompt,
        maxRetries: 2,
      });
      return {
        content: result.text,
        call: {
          node: opts.node,
          model: id,
          mocked: false,
          prompt_tokens: result.usage?.inputTokens ?? null,
          completion_tokens: result.usage?.outputTokens ?? null,
        },
      };
    } finally {
      obs?.end();
    }
  }

  async completeObject<T>(opts: {
    node: string;
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<LLMObjectResult<T>> {
    const { id, model } = this.modelForNode(opts.node);
    const obs = span(`llm.${opts.node}`);
    try {
      const result = await generateObject({
        model,
        system: opts.system,
        prompt: opts.prompt,
        schema: opts.schema,
        maxRetries: 2,
      });
      return {
        data: result.object as T,
        call: {
          node: opts.node,
          model: id,
          mocked: false,
          prompt_tokens: result.usage?.inputTokens ?? null,
          completion_tokens: result.usage?.outputTokens ?? null,
        },
      };
    } finally {
      obs?.end();
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const { embeddings } = await this.provider
      .textEmbeddingModel(this.settings.CLOCKWISE_EMBEDDING_MODEL)
      .doEmbed({ values: texts });
    return embeddings;
  }
}
