import { AppError, upstream } from '../lib/errors.js';
import { httpJson, type FetchLike } from '../lib/http.js';
import type { LlmProvider, LlmRequest, LlmResult } from './llm.js';

/**
 * Google Gemini via the generateContent REST API with JSON-schema structured output.
 *
 * Robustness, because model IDs are retired over time:
 *  - tries the configured model, then fallbacks, moving on only when a model is NOT FOUND (404);
 *  - if strict `responseJsonSchema` is rejected (400), retries once in plain JSON mode with the schema in the prompt.
 * Either way the caller validates the output against the Zod schema and citation checks run as usual.
 * The model has no tools; it cannot fetch URLs or act on instructions found in sources.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'Google Gemini';
  private resolvedModel: string | null = null;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl?: FetchLike,
  ) {}

  private candidates(): string[] {
    return [...new Set([this.resolvedModel ?? this.model, this.model, ...GEMINI_FALLBACK_MODELS])];
  }

  private call(model: string, req: LlmRequest, strictSchema: boolean) {
    const user = strictSchema ? req.user : `${req.user}\n\nReturn ONLY a JSON object that conforms to this JSON Schema:\n${JSON.stringify(req.jsonSchema)}`;
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxTokens ?? 4096,
        responseMimeType: 'application/json',
        ...(strictSchema ? { responseJsonSchema: req.jsonSchema } : {}),
      },
    };
    return httpJson<GeminiResponse>(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      provider: this.name,
      timeoutMs: 90_000,
      retries: 1,
      fetchImpl: this.fetchImpl,
      init: { method: 'POST', headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    });
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    let lastErr: unknown;
    for (const model of this.candidates()) {
      for (const strict of [true, false]) {
        try {
          const r = await this.call(model, req, strict);
          if (r.promptFeedback?.blockReason) throw upstream(this.name, `Request blocked by safety filters (${r.promptFeedback.blockReason})`);
          const text = r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
          if (!text) throw upstream(this.name, `Empty completion (${r.candidates?.[0]?.finishReason ?? 'no candidates'})`);
          this.resolvedModel = model;
          return {
            content: text,
            model: r.modelVersion ?? model,
            usage: { promptTokens: r.usageMetadata?.promptTokenCount ?? null, completionTokens: r.usageMetadata?.candidatesTokenCount ?? null },
          };
        } catch (e) {
          lastErr = e;
          const msg = (e as Error).message ?? '';
          if (e instanceof AppError && /returned 404/.test(msg)) break; // model not available → next model
          if (e instanceof AppError && strict && /returned 400/.test(msg)) continue; // schema rejected → plain JSON mode
          throw e; // auth (401/403), quota (429) and other errors are surfaced as-is
        }
      }
    }
    throw lastErr ?? upstream(this.name, 'No Gemini model available');
  }
}
