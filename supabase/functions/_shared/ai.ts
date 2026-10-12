// Shared OpenAI-compatible streaming chat-completions client for the AI features.
//
// Provider is configured entirely through secrets so we can switch between
// Volcengine Ark (Doubao / DeepSeek hosted), DeepSeek's own API, etc. without
// an app release:
//   supabase secrets set AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
//   supabase secrets set AI_API_KEY=<key>
//   AI_API_KEY falls back to SEEDREAM_API_KEY when unset or empty.
//   supabase secrets set AI_CHAT_MODEL=<model or endpoint id>
//   supabase secrets set AI_VISION_MODEL=<vision-capable model or endpoint id>
// Optional thinking control is sent only to Volcengine Ark (volces.com hosts).

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export class AIError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export function getModel(kind: 'chat' | 'vision'): string {
  const model = Deno.env.get(kind === 'chat' ? 'AI_CHAT_MODEL' : 'AI_VISION_MODEL');
  if (!model) throw new AIError(`server_missing_ai_${kind}_model`, 500);
  return model;
}

export async function chatCompletionStream(
  messages: ChatMessage[],
  model: string,
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number; thinking?: 'enabled' | 'disabled'; label: string },
): Promise<string> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  let outcome = 'error';
  let headersMs: number | undefined;
  let firstReasoningMs: number | undefined;
  let firstContentMs: number | undefined;
  let content = '';
  let reasoning = '';
  let finish: string | undefined;
  let usage: unknown;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    const baseUrl = (Deno.env.get('AI_BASE_URL') ?? '').replace(/\/+$/, '');
    const apiKey = Deno.env.get('AI_API_KEY') || Deno.env.get('SEEDREAM_API_KEY');
    if (!baseUrl || !apiKey) throw new AIError('server_missing_ai_config', 500);

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 1500,
        ...(opts.thinking && new URL(baseUrl).hostname.includes('volces.com')
          ? { thinking: { type: opts.thinking } }
          : {}),
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    }).catch(() => { throw new AIError('ai_unreachable', 504); });
    headersMs = elapsed();

    if (!upstream.ok) {
      outcome = `http_${upstream.status}`;
      const errorText = await upstream.text().catch(() => { throw new AIError('ai_unreachable', 504); });
      let body;
      try { body = JSON.parse(errorText); } catch { /* Non-JSON provider error. */ }
      console.warn(`[ai] upstream ${upstream.status}: ${body?.error?.message ?? body?.message ?? ''}`);
      throw new AIError(`ai_failed_${upstream.status}`, 502);
    }
    if (!upstream.body) throw new AIError('ai_empty_response', 502);
    reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    const parseLine = (line: string) => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data) return;
      if (data === '[DONE]') {
        done = true;
        return;
      }
      let chunk;
      try { chunk = JSON.parse(data); } catch {
        console.warn('[ai] malformed stream chunk skipped');
        return;
      }
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) {
        firstReasoningMs ??= elapsed();
        reasoning += delta.reasoning_content;
      }
      if (typeof delta?.content === 'string' && delta.content) {
        firstContentMs ??= elapsed();
        content += delta.content;
      }
      if (typeof choice?.finish_reason === 'string') finish = choice.finish_reason;
      if (chunk.usage != null) usage = chunk.usage;
    };
    while (!done) {
      const result = await reader.read().catch(() => { throw new AIError('ai_unreachable', 504); });
      buffer += decoder.decode(result.value, { stream: !result.done });
      let newline;
      while (!done && (newline = buffer.indexOf('\n')) !== -1) {
        parseLine(buffer.slice(0, newline).replace(/\r$/, ''));
        buffer = buffer.slice(newline + 1);
      }
      if (result.done) {
        if (!done && buffer) parseLine(buffer.replace(/\r$/, ''));
        break;
      }
    }
    if (controller.signal.aborted) throw new AIError('ai_timeout', 504);
    if (!content.trim()) throw new AIError('ai_empty_response', 502);
    outcome = 'ok';
    return content.trim();
  } catch (e) {
    if (controller.signal.aborted) {
      outcome = 'timeout';
      throw new AIError('ai_timeout', 504);
    }
    if (!(e instanceof AIError && e.message.startsWith('ai_failed_'))) outcome = 'error';
    throw e;
  } finally {
    clearTimeout(timer);
    // Cancel without waiting so cleanup cannot extend the overall timeout.
    if (reader) void reader.cancel().catch(() => {});
    console.log(
      `[ai:${opts.label}] outcome=${outcome} model=${model} headers_ms=${headersMs ?? '-'} first_reasoning_ms=${firstReasoningMs ?? '-'} first_content_ms=${firstContentMs ?? '-'} total_ms=${elapsed()} reasoning_chars=${reasoning.length} content_chars=${content.length} finish=${finish ?? '-'} usage=${usage == null ? '-' : JSON.stringify(usage)}`,
    );
  }
}
