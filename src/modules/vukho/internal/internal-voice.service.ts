import { createHmac } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentMode, Speaker } from '@prisma/client';

import { ApiException } from '../../../common/errors/api.exception';
import { createId } from '../../../common/ids';
import { PrismaService } from '../../prisma/prisma.service';
import { TwilioProviderService } from '../../providers/twilio/twilio-provider.service';
import { UsageService } from '../../usage/usage.service';
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

/** Accumulated AI component usage across all turns of one call. */
interface CallComponentTotals {
  llmTurns: number;
  sttSeconds: number;
  ttsChars: number;
  isHosted: boolean;
}

@Injectable()
export class InternalVoiceService implements OnModuleInit {
  /**
   * Per-call wall-clock start time (ms since epoch).
   * Set when the 'started' event arrives; cleared on 'ended'.
   */
  private readonly callStartTimes = new Map<string, number>();

  /**
   * Accumulated AI component usage (LLM turns, STT seconds, TTS chars).
   * Written each turn; read and cleared when the call ends.
   */
  private readonly callComponentTotals = new Map<string, CallComponentTotals>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly hostedLlm: HostedLlmService,
    private readonly twilio: TwilioProviderService,
    private readonly usage: UsageService,
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

    // ── Transcript timestamps ─────────────────────────────────────────────────
    // Calculate relative timestamps from the wall-clock call start time.
    // User turn: estimate speech start from word count (~2.5 words/sec on phone).
    const callStart = this.callStartTimes.get(callSid) ?? 0;
    const nowMs = Date.now();
    const relativeMsNow = callStart > 0 ? nowMs - callStart : 0;
    const wordCount = transcript.trim().split(/\s+/).length;
    const estimatedSpeechMs = Math.max(500, Math.round((wordCount / 2.5) * 1000));
    const userTurnStartMs = Math.max(0, relativeMsNow - estimatedSpeechMs);
    const userTurnEndMs = relativeMsNow;

    await this.saveTranscriptTurn(
      call.id, call.workspaceId, call.projectId,
      'user', transcript,
      userTurnStartMs, userTurnEndMs,
    );

    const chunks: string[] = [];
    const agentTurnStartMs = callStart > 0 ? Date.now() - callStart : 0;

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
      // Save the full assembled response to the transcript with real timing.
      const fullText = chunks.join(' ').trim();
      const agentTurnEndMs = callStart > 0 ? Date.now() - callStart : 0;
      if (fullText) {
        await this.saveTranscriptTurn(
          call.id, call.workspaceId, call.projectId,
          'agent', fullText,
          agentTurnStartMs, agentTurnEndMs,
        );
      }

      // Accumulate AI component usage in memory — written to DB when the call ends.
      if (fullText) {
        this.accumulateTurnUsage(callSid, {
          agentMode: call.agent.mode,
          speechDurationMs: userTurnEndMs - userTurnStartMs,
          agentResponseChars: fullText.length,
        });
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
      const startedAt = new Date();
      this.callStartTimes.set(callSid, startedAt.getTime());
      await this.prisma.call.update({
        where: { id: call.id },
        data: { status: 'in_progress', startedAt },
      });

      // Start a dual-channel recording on the live call so both the caller's
      // voice and the bot's audio are captured.  Non-fatal if it fails.
      const recordingCallbackUrl = this.config.get<string>('TWILIO_RECORDING_CALLBACK_URL');
      this.twilio.startCallRecording(callSid, recordingCallbackUrl).catch(() => {
        // Recording failure is logged inside startCallRecording; call continues.
      });
    }

    if (event === 'ended') {
      const endedAt = new Date();

      // Use vukho-voice's reported duration if provided; otherwise calculate
      // from the wall-clock start time tracked in memory.
      const reportedSecs = typeof payload.durationSecs === 'number' ? payload.durationSecs : 0;
      const startTime = this.callStartTimes.get(callSid);
      const durationSecs =
        reportedSecs > 0
          ? reportedSecs
          : startTime
            ? Math.round((endedAt.getTime() - startTime) / 1000)
            : (call.startedAt ? Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000) : 0);

      this.callStartTimes.delete(callSid);

      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          status: 'completed',
          endedAt,
          durationSeconds: Math.max(0, durationSecs),
        },
      });

      this.hostedLlm.clearHistory(callSid);

      // Flush accumulated AI component usage to the billing system.
      // Done asynchronously — failure is non-fatal.
      this.finalizeComponentUsage(callSid, call).catch(() => { /* non-fatal */ });

      // Generate AI summary asynchronously — fire and forget so it doesn't
      // block the pipeline teardown.  Failure is non-fatal.
      this.generateAndSaveCallSummary(call.id).catch(() => { /* logged inside */ });
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

  /**
   * Accumulate AI component metrics in memory for each turn.
   * A single usage event per component is written when the call ends (see
   * finalizeComponentUsage), which avoids the Math.ceil-per-event inflation
   * that would occur if we wrote a DB record on every turn.
   */
  private accumulateTurnUsage(
    callSid: string,
    input: { agentMode: AgentMode; speechDurationMs: number; agentResponseChars: number },
  ): void {
    const existing = this.callComponentTotals.get(callSid) ?? {
      llmTurns: 0,
      sttSeconds: 0,
      ttsChars: 0,
      isHosted: input.agentMode === AgentMode.hosted,
    };

    this.callComponentTotals.set(callSid, {
      llmTurns: existing.llmTurns + (input.agentMode === AgentMode.hosted ? 1 : 0),
      sttSeconds: existing.sttSeconds + Math.max(0.5, input.speechDurationMs / 1000),
      ttsChars: existing.ttsChars + input.agentResponseChars,
      isHosted: existing.isHosted || input.agentMode === AgentMode.hosted,
    });
  }

  /**
   * Write one UsageEvent per AI component for the completed call.
   * Called once at call end — totals across all turns, so Math.ceil operates
   * on realistic quantities (e.g. 45 STT seconds) rather than per-turn fractions.
   */
  private async finalizeComponentUsage(
    callSid: string,
    call: { id: string; workspaceId: string; projectId: string; agentId: string },
  ): Promise<void> {
    const totals = this.callComponentTotals.get(callSid);
    this.callComponentTotals.delete(callSid);

    if (!totals) return;

    const sharedContext = {
      workspaceId: call.workspaceId,
      projectId: call.projectId,
      agentId: call.agentId,
      resourceType: 'call',
      resourceId: call.id,
      occurredAt: new Date(),
      reportToStripe: false as const,
    };

    // LLM — hosted mode only; webhook mode uses the customer's own LLM.
    if (totals.isHosted && totals.llmTurns > 0) {
      await this.usage.recordUsage({
        ...sharedContext,
        channel: 'voice.ai.llm',
        quantity: totals.llmTurns,
        unit: 'turn',
        rateKey: 'ai_llm_turn',
        evidence: { totalTurns: totals.llmTurns },
      });
    }

    // STT — always (Sarvam STT is used regardless of agent mode).
    if (totals.sttSeconds > 0) {
      await this.usage.recordUsage({
        ...sharedContext,
        channel: 'voice.ai.stt',
        quantity: Math.round(totals.sttSeconds * 10) / 10, // 1 decimal place
        unit: 'second',
        rateKey: 'ai_stt_second',
        evidence: { totalSpeechSeconds: totals.sttSeconds },
      });
    }

    // TTS — always (agent responses are always synthesised to speech).
    if (totals.ttsChars > 0) {
      await this.usage.recordUsage({
        ...sharedContext,
        channel: 'voice.ai.tts',
        quantity: totals.ttsChars,
        unit: 'character',
        rateKey: 'ai_tts_character',
        evidence: { totalChars: totals.ttsChars },
      });
    }
  }

  private async saveTranscriptTurn(
    callId: string,
    workspaceId: string,
    projectId: string,
    speaker: 'user' | 'agent',
    text: string,
    startedAtMs = 0,
    endedAtMs = 0,
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
        startedAtMs,
        endedAtMs,
      },
    });
  }

  /**
   * Fetch all transcript turns for a call and generate an AI summary,
   * then persist it to the call record.
   * Called asynchronously after the call ends — failure is non-fatal.
   */
  private async generateAndSaveCallSummary(callId: string): Promise<void> {
    const turns = await this.prisma.transcriptTurn.findMany({
      where: { callId },
      orderBy: { startedAtMs: 'asc' },
      select: { speaker: true, text: true },
    });

    if (turns.length === 0) return;

    const summary = await this.hostedLlm.summarize(
      turns.map((t) => ({ speaker: t.speaker as 'user' | 'agent', text: t.text })),
    );

    if (summary) {
      await this.prisma.call.update({
        where: { id: callId },
        data: { summary },
      });
    }
  }
}
