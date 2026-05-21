import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Runs LLM inference for hosted-mode agents.
 * Maintains conversation history per callSid in memory.
 * Supports Anthropic and Groq. Defaults to Anthropic Haiku (fast + cheap).
 */
@Injectable()
export class HostedLlmService {
  private readonly histories = new Map<string, Message[]>();

  constructor(private readonly config: ConfigService) {}

  async generateResponse(callSid: string, systemPrompt: string, transcript: string): Promise<string> {
    const history = this.getOrCreateHistory(callSid, systemPrompt);
    history.push({ role: 'user', content: transcript });

    const provider = this.config.get<string>('HOSTED_LLM_PROVIDER') ?? 'anthropic';
    const response = provider === 'groq'
      ? await this.callGroq(history)
      : await this.callAnthropic(history, systemPrompt);

    history.push({ role: 'assistant', content: response });
    return response;
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

  private async callAnthropic(messages: Message[], systemPrompt: string): Promise<string> {
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
        max_tokens: 150,
        system: systemPrompt,
        messages: conversationMessages,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const data = (await response.json()) as {
      content?: Array<{ type: string; text: string }>;
    };
    return data.content?.[0]?.text ?? '';
  }

  private async callGroq(messages: Message[]): Promise<string> {
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
        max_tokens: 150,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const data = (await response.json()) as {
      choices?: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }
}
