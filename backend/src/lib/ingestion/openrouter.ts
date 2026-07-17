/**
 * Minimal OpenRouter client. OpenRouter exposes an OpenAI-compatible
 * chat-completions API, so we hit it with global fetch — no SDK dependency.
 */
export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** JSON Schema for structured output (sent as response_format json_schema). */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  maxTokens?: number;
  /** Enable reasoning ("thinking") for models that support it. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Hard stop for a remote completion so callers can persist a retryable failure. */
  timeoutMs?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts: OpenRouterOptions
): Promise<string> {
  const baseUrl = opts.baseUrl ?? 'https://openrouter.ai/api/v1';

  const body: Record<string, unknown> = {
    model: opts.model,
    messages,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 48000
  };
  if (opts.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: opts.jsonSchema.name, strict: false, schema: opts.jsonSchema.schema }
    };
  }
  if (opts.reasoningEffort) body.reasoning = { effort: opts.reasoningEffort };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'TaxAlpha Form Ingestion'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 5 * 60 * 1000)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned no content.');
  return content;
}

/**
 * Vision chat: send a page image (PNG base64) alongside text so the model can
 * SEE the page layout — which blank each printed label points to. Used by the
 * paged ingestion to fix field↔label association / off-by-one errors.
 */
export async function chatWithImage(
  system: string,
  userText: string,
  imagePngBase64: string | null,
  opts: OpenRouterOptions
): Promise<string> {
  const baseUrl = opts.baseUrl ?? 'https://openrouter.ai/api/v1';
  const userContent: unknown = imagePngBase64
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imagePngBase64}` } }
      ]
    : userText;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'TaxAlpha Form Ingestion'
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent }
      ],
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 32000,
      ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {})
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 5 * 60 * 1000)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter(vision) ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter(vision) returned no content.');
  return content;
}
