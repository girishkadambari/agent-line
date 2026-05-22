import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Runs LLM inference for hosted-mode agents.
 * Maintains conversation history per callSid in memory.
 *
 * Primary path: streamResponse() — yields sentence-boundary chunks as fast as
 * the LLM produces them so the TTS pipeline starts speaking with minimal TTFB.
 * generateResponse() is kept for non-voice code paths that want a single string.
 *
 * Providers: Anthropic (default, Haiku) | Groq (Llama 3.3 70B).
 *
 * Fallback: if Anthropic returns overloaded_error and GROQ_API_KEY is set,
 * streamResponse() automatically retries with Groq.
 */

/** Thrown when Anthropic's API is overloaded so callers can retry or fallback. */
class AnthropicOverloadedError extends Error {
  constructor() {
    super('Anthropic overloaded');
    this.name = 'AnthropicOverloadedError';
  }
}
@Injectable()
export class HostedLlmService {
  private readonly histories = new Map<string, Message[]>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Streaming variant: yields sentence fragments as they arrive.
   * Each yielded string ends at a natural sentence boundary (.!?) so it can be
   * handed directly to TTS.  The final fragment (whatever is left after the
   * stream ends) is yielded without a terminator.
   *
   * History is updated once the full response is assembled in `finally`.
   * Auto-fallback: if Anthropic is overloaded, retries with Groq automatically.
   */
  async *streamResponse(
    callSid: string,
    systemPrompt: string,
    transcript: string,
  ): AsyncGenerator<string> {
    const history = this.getOrCreateHistory(callSid, systemPrompt);
    history.push({ role: 'user', content: transcript });

    const provider = this.config.get<string>('HOSTED_LLM_PROVIDER') ?? 'anthropic';
    const full: string[] = [];

    try {
      // Build the generator — fall back to Groq if Anthropic is overloaded.
      const gen = await this.buildLlmGenerator(provider, history, systemPrompt);

      let buffer = '';
      for await (const token of gen) {
        buffer += token;
        full.push(token);
        const { sentences, remaining } = flushSentences(buffer);
        for (const sentence of sentences) {
          yield sentence;
        }
        buffer = remaining;
      }

      // Flush whatever is left in the buffer (last sentence without punctuation).
      if (buffer.trim()) {
        yield buffer.trim();
      }
    } finally {
      // Always save the full assistant response to history even on cancellation.
      const fullText = full.join('');
      if (fullText) {
        history.push({ role: 'assistant', content: fullText });
      }
    }
  }

  /**
   * Generate a concise summary of a completed call from its transcript.
   * One-shot — does not use or update conversation history.
   * Returns an empty string on failure so callers can treat it as optional.
   */
  async summarize(turns: Array<{ speaker: 'user' | 'agent'; text: string }>): Promise<string> {
    if (turns.length === 0) return '';

    const formatted = turns
      .map((t) => `${t.speaker === 'agent' ? 'Agent' : 'Caller'}: ${t.text}`)
      .join('\n');

    const systemPrompt =
      'You are a call summarization assistant. ' +
      'Summarize the following phone call transcript in 2–3 concise sentences. ' +
      'Cover: what the caller wanted, what the agent provided, and the outcome. ' +
      'Write in third person. No bullet points. No markdown.';

    const history: Message[] = [
      { role: 'user', content: `Transcript:\n\n${formatted}\n\nSummary:` },
    ];

    try {
      const provider = this.config.get<string>('HOSTED_LLM_PROVIDER') ?? 'anthropic';
      const gen = await this.buildLlmGenerator(provider, history, systemPrompt);
      const tokens: string[] = [];
      for await (const token of gen) {
        tokens.push(token);
      }
      return tokens.join('').trim();
    } catch {
      return '';
    }
  }

  /**
   * Builds the appropriate LLM generator.
   * If the primary provider is Anthropic and it returns overloaded_error,
   * automatically falls back to Groq (if GROQ_API_KEY is configured).
   */
  private async buildLlmGenerator(
    provider: string,
    history: Message[],
    systemPrompt: string,
  ): Promise<AsyncGenerator<string>> {
    if (provider === 'groq') {
      return this.streamGroq(history);
    }

    // Anthropic path — try it first, fall back to Groq on overload.
    const anthropicGen = this.streamAnthropic(history, systemPrompt);

    // Peek: attempt to get the first token to catch an immediate overload error.
    // We need to turn the async generator into a peekable one.
    return this.withAnthropicFallback(anthropicGen, history);
  }

  /**
   * Wraps an Anthropic generator with Groq fallback on AnthropicOverloadedError.
   * Buffers the first value to detect overload before yielding anything.
   */
  private async *withAnthropicFallback(
    anthropicGen: AsyncGenerator<string>,
    history: Message[],
  ): AsyncGenerator<string> {
    let firstResult: IteratorResult<string>;

    try {
      firstResult = await anthropicGen.next();
    } catch (err) {
      if (err instanceof AnthropicOverloadedError) {
        const groqKey = this.config.get<string>('GROQ_API_KEY');
        if (groqKey) {
          yield* this.streamGroq(history);
          return;
        }
        throw new Error('LLM unavailable: Anthropic overloaded and no Groq fallback configured.');
      }
      throw err;
    }

    if (firstResult.done) return;
    yield firstResult.value;
    yield* anthropicGen;
  }

  /**
   * Non-streaming variant — kept for compatibility with SMS / non-voice paths.
   */
  async generateResponse(callSid: string, systemPrompt: string, transcript: string): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.streamResponse(callSid, systemPrompt, transcript)) {
      chunks.push(chunk);
    }
    return chunks.join(' ');
  }

  clearHistory(callSid: string): void {
    this.histories.delete(callSid);
  }

  private getOrCreateHistory(callSid: string, systemPrompt: string): Message[] {
    if (!this.histories.has(callSid)) {
      const history: Message[] = [];
      if (systemPrompt) {
        history.push({ role: 'system', content: systemPrompt });
      }
      this.histories.set(callSid, history);
    }
    return this.histories.get(callSid)!;
  }

  // ---------------------------------------------------------------------------
  // Anthropic SSE streaming
  // ---------------------------------------------------------------------------

  private async *streamAnthropic(messages: Message[], systemPrompt: string): AsyncGenerator<string> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        stream: true,
        system: systemPrompt,
        messages: conversationMessages,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Anthropic HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const raw = trimmed.slice(5).trim();
          if (raw === '[DONE]') return;

          // Parse the SSE data line — skip malformed lines.
          let evt: { type: string; delta?: { type: string; text: string }; error?: { type: string; message: string } };
          try {
            evt = JSON.parse(raw);
          } catch {
            continue; // malformed JSON — skip this line
          }

          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            yield evt.delta.text;
          } else if (evt.type === 'error') {
            // Anthropic surfaces errors as SSE data events even on HTTP 200.
            // overloaded_error → caller can fallback to another provider.
            // Any other error (auth, invalid_request) → re-throw as fatal.
            if (evt.error?.type === 'overloaded_error') {
              throw new AnthropicOverloadedError();
            }
            throw new Error(`Anthropic stream error [${evt.error?.type}]: ${evt.error?.message ?? 'unknown'}`);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ---------------------------------------------------------------------------
  // Groq streaming (OpenAI-compatible SSE)
  // ---------------------------------------------------------------------------

  private async *streamGroq(messages: Message[]): AsyncGenerator<string> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY not configured');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 80,
        temperature: 0.3,
        stream: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Groq HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const raw = trimmed.slice(5).trim();
          if (raw === '[DONE]') return;

          try {
            const evt = JSON.parse(raw) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const token = evt.choices?.[0]?.delta?.content;
            if (token) yield token;
          } catch {
            // Malformed SSE line — skip.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// ---------------------------------------------------------------------------
// Sentence-boundary flushing helper
// ---------------------------------------------------------------------------

/**
 * Split `text` at sentence boundaries (.!?).
 * Returns complete sentences plus whatever remains in `remaining`.
 * Sentence delimiters are kept at the end of each sentence.
 */
export function flushSentences(text: string): { sentences: string[]; remaining: string } {
  const sentences: string[] = [];
  // Match any run of characters ending in .!? (optionally followed by whitespace).
  const re = /[^.!?]*[.!?]+\s*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const sentence = match[0].trim();
    if (sentence) sentences.push(sentence);
    lastIndex = re.lastIndex;
  }

  return { sentences, remaining: text.slice(lastIndex) };
}
