import { httpJson, type FetchLike } from '../lib/http.js';
import { upstream } from '../lib/errors.js';

export interface LlmRequest {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResult {
  content: string;
  model: string;
  usage: { promptTokens: number | null; completionTokens: number | null };
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}

/**
 * OpenRouter chat completions with strict JSON-schema structured outputs.
 * `provider.require_parameters: true` routes only to endpoints that honour `response_format`.
 * The model has NO tools — it cannot fetch URLs or act on instructions found in sources.
 */
export class OpenRouterProvider implements LlmProvider {
  readonly name = 'OpenRouter';
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = 'https://openrouter.ai/api/v1',
    private readonly appUrl = 'https://alphapulse.local',
    private readonly fetchImpl?: FetchLike,
  ) {}

  async complete(req: LlmRequest): Promise<LlmResult> {
    const body = {
      model: this.model,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 3000,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema } },
      provider: { require_parameters: true },
    };
    const r = await httpJson<{
      choices?: { message?: { content?: string | null } }[];
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    }>(`${this.baseUrl}/chat/completions`, {
      provider: this.name,
      timeoutMs: 90_000,
      retries: 1,
      fetchImpl: this.fetchImpl,
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.appUrl,
          'X-Title': 'AlphaPulse AI',
        },
        body: JSON.stringify(body),
      },
    });
    if (r.error) throw upstream(this.name, r.error.message ?? 'LLM error');
    const content = r.choices?.[0]?.message?.content;
    if (!content) throw upstream(this.name, 'Empty completion');
    return {
      content,
      model: r.model ?? this.model,
      usage: { promptTokens: r.usage?.prompt_tokens ?? null, completionTokens: r.usage?.completion_tokens ?? null },
    };
  }
}
