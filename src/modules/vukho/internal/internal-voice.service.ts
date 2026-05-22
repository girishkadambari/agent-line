import { createHmac } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentMode, Speaker } from '@prisma/client';

import { ApiException } from '../../../common/errors/api.exception';
import { createId } from '../../../common/ids';
import { PrismaService } from '../../prisma/prisma.service';
import { HostedLlmService } from '../llm/hosted-llm.service';

export interface AgentCallConfig {
  agentId: string;
  mode: AgentMode;
  webhookUrl: string | null;
  systemPrompt: string | null;
  voice: string;
  language: string;
  beginMessage: string;
}

export interface TurnResult {
  text: string;
  interim: boolean;
}

// Speaker defaults per language — used when agent.voice is not set or invalid.
const LANGUAGE_DEFAULT_SPEAKER: Record<string, string> = {
  'en-IN': 'ritu',
  'hi-IN': 'rahul',
  'kn-IN': 'ritu',
  'ta-IN': 'ritu',
  'te-IN': 'amit',
  'ml-IN': 'priya',
  'mr-IN': 'priya',
  'bn-IN': 'dev',
  'gu-IN': 'manan',
  'pa-IN': 'varun',
};

// All valid bulbul:v3 speakers.
const VALID_SPEAKERS = new Set([
  'aditya', 'ritu', 'ashutosh', 'priya', 'neha', 'rahul', 'pooja', 'rohan',
  'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun',
  'manan', 'sumit', 'roopa', 'kabir', 'aayan', 'shubh', 'advait', 'anand',
  'tanya', 'tarun', 'sunny', 'mani', 'gokul', 'vijay', 'shruti', 'suhani',
  'mohit', 'kavitha', 'rehan', 'soham', 'rupali', 'niharika',
]);

@Injectable()
export class InternalVoiceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly hostedLlm: HostedLlmService,
  ) {}

  onModuleInit() {}

  verifySecret(secret: string): void {
    const expected = this.config.get<string>('VUKHO_INTERNAL_SECRET') ?? '';
    if (expected && secret !== expected) {
      throw new ApiException('unauthorized', 'Invalid internal secret.', 401);
    }
  }

  async getCallConfig(callSid: string): Promise<AgentCallConfig> {
    const call = await this.prisma.call.findFirst({
      where: { providerCallId: callSid },
      include: { agent: true },
    });

    if (!call) {
      throw new ApiException('not_found', `No call found for callSid: ${callSid}`, 404);
    }

    const agent = call.agent;
    const language = agent.language ?? 'en-IN';
    const voice = this.resolveVoice(agent.voice, language);

    return {
      agentId: agent.id,
      mode: agent.mode,
      webhookUrl: agent.webhookUrl ?? null,
      systemPrompt: agent.systemPrompt ?? null,
      voice,
      language,
      beginMessage: agent.beginMessage ?? 'Hello! How can I help you today?',
    };
  }

  /**
   * Streaming turn handler — yields TurnResult chunks as they arrive.
   *
   * For hosted mode: LLM sentence-boundary chunks are yielded progressively
   * (interim=true) until the final chunk (interim=false).
   * For webhook mode: single blocking call, yielded as one final chunk.
   *
   * Transcript turns are persisted in `finally` so partial results are
   * saved even if the caller disconnects mid-stream.
   */
  async *handleTurnStream(callSid: string, transcript: string): AsyncGenerator<TurnResult> {
    const call = await this.prisma.call.findFirst({
      where: { providerCallId: callSid },
      include: { agent: true },
    });

    if (!call) {
      throw new ApiException('not_found', `No call found for callSid: ${callSid}`, 404);
    }

    await this.saveTranscriptTurn(call.id, call.workspaceId, call.projectId, 'user', transcript);

    const chunks: string[] = [];

    try {
      if (call.agent.mode === AgentMode.hosted) {
        // Stream sentence-by-sentence from the LLM.
        const gen = this.hostedLlm.streamResponse(
          callSid,
          call.agent.systemPrompt ?? '',
          transcript,
        );

        let prev: string | null = null;
        for await (const chunk of gen) {
          if (prev !== null) {
            // Emit the previous chunk as interim.
            chunks.push(prev);
            yield { text: prev, interim: true };
          }
          prev = chunk;
        }
        // Emit the last chunk as final.
        if (prev !== null) {
          chunks.push(prev);
          yield { text: prev, interim: false };
        }

        // Guard: if LLM yielded nothing (e.g. silent upstream error), send fallback.
        if (chunks.length === 0) {
          const fallback = "I'm sorry, I'm having trouble right now. Could you repeat that?";
          yield { text: fallback, interim: false };
        }
      } else if (call.agent.mode === AgentMode.webhook) {
        const text = await this.forwardToWebhook(call.agent.webhookUrl, callSid, transcript);
        chunks.push(text);
        yield { text, interim: false };
      } else {
        const text = 'I am not configured to handle calls.';
        chunks.push(text);
        yield { text, interim: false };
      }
    } finally {
      // Save the full assembled response to the transcript.
      const fullText = chunks.join(' ').trim();
      if (fullText) {
        await this.saveTranscriptTurn(call.id, call.workspaceId, call.projectId, 'agent', fullText);
      }
    }
  }

  /**
   * Non-streaming variant for compatibility (e.g., SMS flows).
   */
  async handleTurn(callSid: string, transcript: string): Promise<TurnResult> {
    const chunks: TurnResult[] = [];
    for await (const chunk of this.handleTurnStream(callSid, transcript)) {
      chunks.push(chunk);
    }
    const last = chunks[chunks.length - 1];
    if (!last) return { text: '', interim: false };
    // Return combined text as a single final result.
    return { text: chunks.map((c) => c.text).join(' '), interim: false };
  }

  async handleEvent(
    callSid: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const call = await this.prisma.call.findFirst({
      where: { providerCallId: callSid },
    });

    if (!call) return;

    if (event === 'started') {
      await this.prisma.call.update({
        where: { id: call.id },
        data: { status: 'in_progress', startedAt: new Date() },
      });
    }

    if (event === 'ended') {
      const durationSecs = typeof payload.durationSecs === 'number' ? payload.durationSecs : 0;
      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          status: 'completed',
          endedAt: new Date(),
          durationSeconds: Math.round(durationSecs),
        },
      });
      this.hostedLlm.clearHistory(callSid);
    }
  }

  private resolveVoice(voice: string | null | undefined, language: string): string {
    if (voice && VALID_SPEAKERS.has(voice)) {
      return voice;
    }
    return LANGUAGE_DEFAULT_SPEAKER[language] ?? 'ritu';
  }

  /**
   * POST transcript to agent's webhook URL.
   *
   * Adds an HMAC-SHA256 signature header (`X-Vukho-Signature`) so webhook
   * receivers can verify the request originated from Vukho.
   * Retries once on network errors or 5xx responses.
   *
   * Expected response shape: `{ text: string }`
   */
  private async forwardToWebhook(
    webhookUrl: string | null,
    callSid: string,
    transcript: string,
  ): Promise<string> {
    if (!webhookUrl) {
      return 'This agent has no webhook configured.';
    }

    const payload = JSON.stringify({ call_id: callSid, transcript });
    const secret =
      (this.config.get<string>('VUKHO_WEBHOOK_SECRET_PEPPER') ?? '') +
      (this.config.get<string>('VUKHO_INTERNAL_SECRET') ?? '');
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    const headers = {
      'Content-Type': 'application/json',
      'X-Vukho-Signature': `sha256=${signature}`,
    };

    // Two attempts: initial + one retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: payload,
          signal: AbortSignal.timeout(8_000),
        });

        if (response.ok) {
          const data = (await response.json()) as Record<string, unknown>;
          return typeof data.text === 'string' ? data.text : '';
        }

        // 4xx errors are not retryable.
        if (response.status >= 400 && response.status < 500) {
          return 'I had trouble reaching the agent. Please try again.';
        }

        // 5xx — retry once.
      } catch {
        // Network error — retry once.
        if (attempt === 1) {
          return 'I had trouble reaching the agent. Please try again.';
        }
      }
    }

    return 'I had trouble reaching the agent. Please try again.';
  }

  private async saveTranscriptTurn(
    callId: string,
    workspaceId: string,
    projectId: string,
    speaker: 'user' | 'agent',
    text: string,
  ): Promise<void> {
    const speakerEnum = speaker === 'user' ? Speaker.user : Speaker.agent;
    await this.prisma.transcriptTurn.create({
      data: {
        id: createId('turn'),
        workspaceId,
        projectId,
        callId,
        speaker: speakerEnum,
        text,
        startedAtMs: 0,
        endedAtMs: 0,
      },
    });
  }
}
