/**
 * Unified AI service — supports Gemini, OpenAI, Anthropic, and local Ollama.
 * All modules use this single entry point so the selected model/key applies everywhere.
 */

export interface AIProvider {
  type: 'gemini' | 'openai' | 'anthropic' | 'ollama';
  apiKey?: string;
  model: string;
  localUrl?: string; // for ollama
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export interface AIOptions {
  isJson?: boolean;
  systemInstruction?: string;
  base64Image?: string;
  mimeType?: string;
  maxRetries?: number;
}

/**
 * Exponential backoff retry with jitter.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes('429') || err.message.includes('503'));
      if (attempt === maxRetries || !isRateLimit) throw err;

      const delay = baseDelayMs * 2 ** attempt + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// --- Gemini ---
async function callGemini(
  messages: AIMessage[],
  provider: AIProvider,
  opts: AIOptions,
): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  if (opts.base64Image && opts.mimeType) {
    contents[contents.length - 1].parts.push({
      // @ts-expect-error - inline data part
      inlineData: { mimeType: opts.mimeType, data: opts.base64Image },
    });
  }

  const payload: Record<string, unknown> = { contents };
  if (opts.isJson) payload.generationConfig = { responseMimeType: 'application/json' };
  if (opts.systemInstruction)
    payload.systemInstruction = { parts: [{ text: opts.systemInstruction }] };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const status = res.status;
    if (status === 429) throw new Error('429 Rate limit exceeded');
    if (status === 503) throw new Error('503 Service unavailable');
    throw new Error(`Gemini API error: ${status}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// --- OpenAI ---
async function callOpenAI(
  messages: AIMessage[],
  provider: AIProvider,
  opts: AIOptions,
): Promise<string> {
  const openaiMessages = [
    ...(opts.systemInstruction
      ? [{ role: 'system', content: opts.systemInstruction }]
      : []),
    ...messages.map((m) => ({ role: m.role, content: m.text })),
  ];

  const payload: Record<string, unknown> = {
    model: provider.model,
    messages: openaiMessages,
  };
  if (opts.isJson) payload.response_format = { type: 'json_object' };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const status = res.status;
    if (status === 429) throw new Error('429 Rate limit exceeded');
    throw new Error(`OpenAI error: ${status}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// --- Anthropic ---
async function callAnthropic(
  messages: AIMessage[],
  provider: AIProvider,
  opts: AIOptions,
): Promise<string> {
  const anthropicMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.text,
  }));

  const payload: Record<string, unknown> = {
    model: provider.model,
    max_tokens: 4096,
    messages: anthropicMessages,
  };
  if (opts.systemInstruction) payload.system = opts.systemInstruction;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  return data?.content?.[0]?.text ?? '';
}

// --- Ollama (local) ---
async function callOllama(
  messages: AIMessage[],
  provider: AIProvider,
  opts: AIOptions,
): Promise<string> {
  const prompt =
    (opts.systemInstruction ? opts.systemInstruction + '\n\n' : '') +
    messages.map((m) => `${m.role}: ${m.text}`).join('\n');

  const payload: Record<string, unknown> = {
    model: provider.model,
    prompt,
    stream: false,
    format: opts.isJson ? 'json' : undefined,
  };
  if (opts.base64Image) payload.images = [opts.base64Image];

  const url = provider.localUrl ?? 'http://127.0.0.1:11434/api/generate';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data?.response ?? '';
}

// --- Main unified entry point ---
export async function callAI(
  promptOrMessages: string | AIMessage[],
  provider: AIProvider,
  opts: AIOptions = {},
): Promise<string> {
  const messages: AIMessage[] =
    typeof promptOrMessages === 'string'
      ? [{ role: 'user', text: promptOrMessages }]
      : promptOrMessages;

  const maxRetries = opts.maxRetries ?? 3;

  return withRetry(async () => {
    switch (provider.type) {
      case 'gemini':
        return callGemini(messages, provider, opts);
      case 'openai':
        return callOpenAI(messages, provider, opts);
      case 'anthropic':
        return callAnthropic(messages, provider, opts);
      case 'ollama':
        return callOllama(messages, provider, opts);
      default:
        throw new Error(`Unknown provider: ${provider.type}`);
    }
  }, maxRetries);
}

/**
 * Parse JSON from AI response, stripping markdown fences.
 */
export function parseAIJson<T>(text: string, fallback: T): T {
  try {
    const cleaned = text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}
