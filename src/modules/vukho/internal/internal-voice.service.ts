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

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface AgentCallConfig {
  agentId: string;
  mode: AgentMode;
  webhookUrl: string | null;
  systemPrompt: string | null;
  voice: string;
  language: string;
  beginMessage: string;
  /** Seconds before the webhook call times out. 5–120. Default 30. */
  webhookTimeoutSeconds: number;
}

export interface TurnResult {
  text: string;
  interim: boolean;
  /** If true, vukho-voice should hang up after speaking this text. */
  hangup?: boolean;
  /**
   * `transfer` — forward the call to `transferTo` after speaking.
   * `hangup`   — alternative way to signal hang-up (same as `hangup: true`).
   */
  action?: 'transfer' | 'hangup';
  /** Target E.164 number for `action: "transfer"`. */
  transferTo?: string;
  /** If set, vukho-voice should send an SMS immediately after this turn. */
  sendMessage?: { body: string };
  /** DTMF digit string to inject (e.g. `"1*#"`) for IVR navigation. */
  digits?: string;
}

// ─── Webhook protocol types ───────────────────────────────────────────────────
// All payloads Vukho sends to the customer's webhook URL.

/** Sent once when the call connects. Customer should init their agent session. */
interface WebhookCallStartedPayload {
  event: 'call.started';
  channel: 'voice';
  call_id: string;
  agent_id: string;
  direction: string;
  from: string;
  to: string;
  started_at: string;
}

/**
 * Sent for every user speech turn.
 * Customer MUST respond with `{ text: string }` — or NDJSON stream.
 */
interface WebhookTurnPayload {
  event: 'agent.message';
  channel: 'voice';
  call_id: string;
  agent_id: string;
  direction: string;
  from: string;
  to: string;
  data: { transcript: string };
  /** Prior turns in this call (not including the current user turn). */
  recentHistory: Array<{ role: 'user' | 'agent'; content: string }>;
}

/** Sent once when the call ends. Customer should clean up their agent session. */
interface WebhookCallEndedPayload {
  event: 'call.ended';
  channel: 'voice';
  call_id: string;
  agent_id: string;
  direction: string;
  from: string;
  to: string;
  duration_seconds: number;
  ended_at: string;
}

/**
 * Shape of a single chunk from the customer's webhook response.
 * Supports both simple JSON and NDJSON streaming.
 */
interface WebhookResponseChunk {
  text?: string;
  interim?: boolean;
  hangup?: boolean;
  action?: string;
  /** camelCase alias for transferTo */
  transferTo?: string;
  /** snake_case alias for transferTo */
  transfer_to?: string;
  send_message?: { body: string };
  digits?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

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

// ─── Service ──────────────────────────────────────────────────────────────────

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
      webhookTimeoutSeconds: agent.webhookTimeoutSeconds ?? 30,
    };
  }

  /**
   * Streaming turn handler — yields TurnResult chunks as they arrive.
   *
   * Hosted mode:  LLM sentence-boundary chunks yielded progressively.
   * Webhook mode: Customer's server response yielded — supports both simple
   *               `{ text }` JSON and streaming NDJSON with interim chunks.
   *               Response may include actions: hangup, transfer, send_message.
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
    const callStart = this.callStartTimes.get(callSid) ?? 0;
    const nowMs = Date.now();
    const relativeMsNow = callStart > 0 ? nowMs - callStart : 0;
    const wordCount = transcript.trim().split(/\s+/).length;
    const estimatedSpeechMs = Math.max(500, Math.round((wordCount / 2.5) * 1000));
    const userTurnStartMs = Math.max(0, relativeMsNow - estimatedSpeechMs);
    const userTurnEndMs = relativeMsNow;

    // ── For webhook mode: fetch history BEFORE saving current user turn ───────
    // This ensures recentHistory only contains prior turns, not the current one.
    const recentHistory =
      call.agent.mode === AgentMode.webhook
        ? await this.fetchRecentHistory(call.id)
        : [];

    // ── Save the user's turn ──────────────────────────────────────────────────
    await this.saveTranscriptTurn(
      call.id, call.workspaceId, call.projectId,
      'user', transcript,
      userTurnStartMs, userTurnEndMs,
    );

    const chunks: string[] = [];
    const agentTurnStartMs = callStart > 0 ? Date.now() - callStart : 0;

    try {
      if (call.agent.mode === AgentMode.hosted) {
        // ── Hosted: stream sentence-by-sentence from our LLM ─────────────────
        const gen = this.hostedLlm.streamResponse(
          callSid,
          call.agent.systemPrompt ?? '',
          transcript,
        );

        let prev: string | null = null;
        for await (const chunk of gen) {
          if (prev !== null) {
            chunks.push(prev);
            yield { text: prev, interim: true };
          }
          prev = chunk;
        }
        if (prev !== null) {
          chunks.push(prev);
          yield { text: prev, interim: false };
        }

        if (chunks.length === 0) {
          const fallback = "I'm sorry, I'm having trouble right now. Could you repeat that?";
          chunks.push(fallback);
          yield { text: fallback, interim: false };
        }

      } else if (call.agent.mode === AgentMode.webhook) {
        // ── Webhook: forward to customer's server, support streaming response ─
        const turnPayload: WebhookTurnPayload = {
          event: 'agent.message',
          channel: 'voice',
          call_id: call.id,
          agent_id: call.agentId,
          direction: call.direction,
          from: call.fromNumber,
          to: call.toNumber,
          data: { transcript },
          recentHistory,
        };

        const timeoutSeconds = call.agent.webhookTimeoutSeconds ?? 30;

        for await (const chunk of this.streamWebhookTurn(
          call.agent.webhookUrl,
          turnPayload,
          timeoutSeconds,
        )) {
          if (chunk.text) chunks.push(chunk.text);
          yield chunk;
        }

      } else {
        const text = 'I am not configured to handle calls.';
        chunks.push(text);
        yield { text, interim: false };
      }
    } finally {
      // ── Save the agent's full assembled response ───────────────────────────
      const fullText = chunks.join(' ').trim();
      const agentTurnEndMs = callStart > 0 ? Date.now() - callStart : 0;
      if (fullText) {
        await this.saveTranscriptTurn(
          call.id, call.workspaceId, call.projectId,
          'agent', fullText,
          agentTurnStartMs, agentTurnEndMs,
        );
      }

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
   * Non-streaming variant for compatibility (e.g. SMS flows).
   */
  async handleTurn(callSid: string, transcript: string): Promise<TurnResult> {
    const chunks: TurnResult[] = [];
    for await (const chunk of this.handleTurnStream(callSid, transcript)) {
      chunks.push(chunk);
    }
    const last = chunks[chunks.length - 1];
    if (!last) return { text: '', interim: false };
    return {
      text: chunks.map((c) => c.text).join(' '),
      interim: false,
      hangup: last.hangup,
      action: last.action,
      transferTo: last.transferTo,
      sendMessage: last.sendMessage,
      digits: last.digits,
    };
  }

  async handleEvent(
    callSid: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const call = await this.prisma.call.findFirst({
      where: { providerCallId: callSid },
      include: {
        agent: {
          select: {
            id: true,
            mode: true,
            webhookUrl: true,
            webhookTimeoutSeconds: true,
          },
        },
      },
    });

    if (!call) return;

    if (event === 'started') {
      const startedAt = new Date();
      this.callStartTimes.set(callSid, startedAt.getTime());

      await this.prisma.call.update({
        where: { id: call.id },
        data: { status: 'in_progress', startedAt },
      });

      // ── Fire call.started lifecycle event to customer's webhook ─────────────
      if (call.agent.mode === AgentMode.webhook && call.agent.webhookUrl) {
        const lifecyclePayload: WebhookCallStartedPayload = {
          event: 'call.started',
          channel: 'voice',
          call_id: call.id,
          agent_id: call.agentId,
          direction: call.direction,
          from: call.fromNumber,
          to: call.toNumber,
          started_at: startedAt.toISOString(),
        };
        this.sendWebhookLifecycle(call.agent.webhookUrl, lifecyclePayload).catch(() => {
          // Non-fatal — lifecycle events are best-effort
        });
      }

      // ── Start dual-channel recording ─────────────────────────────────────
      const recordingCallbackUrl = this.config.get<string>('TWILIO_RECORDING_CALLBACK_URL');
      this.twilio.startCallRecording(callSid, recordingCallbackUrl).catch(() => {
        // Recording failure is non-fatal; call continues
      });
    }

    if (event === 'ended') {
      const endedAt = new Date();

      const reportedSecs = typeof payload['durationSecs'] === 'number' ? payload['durationSecs'] : 0;
      const startTime = this.callStartTimes.get(callSid);
      const durationSecs =
        reportedSecs > 0
          ? reportedSecs
          : startTime
            ? Math.round((endedAt.getTime() - startTime) / 1000)
            : call.startedAt
              ? Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000)
              : 0;

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

      // ── Fire call.ended lifecycle event to customer's webhook ─────────────
      if (call.agent.mode === AgentMode.webhook && call.agent.webhookUrl) {
        const lifecyclePayload: WebhookCallEndedPayload = {
          event: 'call.ended',
          channel: 'voice',
          call_id: call.id,
          agent_id: call.agentId,
          direction: call.direction,
          from: call.fromNumber,
          to: call.toNumber,
          duration_seconds: Math.max(0, durationSecs),
          ended_at: endedAt.toISOString(),
        };
        this.sendWebhookLifecycle(call.agent.webhookUrl, lifecyclePayload).catch(() => {
          // Non-fatal
        });
      }

      this.finalizeComponentUsage(callSid, call).catch(() => { /* non-fatal */ });
      this.generateAndSaveCallSummary(call.id).catch(() => { /* non-fatal */ });
    }
  }

  /**
   * Send an SMS from the agent's number to the caller.
   * Called by vukho-voice when a turn response includes a `send_message` action.
   */
  async sendCallSms(callSid: string, body: string): Promise<void> {
    const call = await this.prisma.call.findFirst({
      where: { providerCallId: callSid },
      include: {
        agent: { select: { id: true } },
        phoneNumber: { select: { phoneNumber: true } },
      },
    });

    if (!call) {
      throw new ApiException('not_found', `No call found for callSid: ${callSid}`, 404);
    }

    if (!call.phoneNumber?.phoneNumber) {
      throw new ApiException('invalid_request', 'No phone number associated with this call', 400);
    }

    await this.twilio.sendSms({
      from: call.phoneNumber.phoneNumber,
      to: call.fromNumber,  // caller's number
      body,
    });
  }

  // ─── Webhook: turn streaming ───────────────────────────────────────────────

  /**
   * POST a turn to the customer's webhookUrl and yield response chunks.
   *
   * Supports two response formats from the customer's server:
   *   1. Simple JSON: `{ text, hangup?, action?, transferTo?, send_message?, digits? }`
   *   2. NDJSON stream: `Content-Type: application/x-ndjson`, one JSON object per line.
   *      Intermediate chunks use `{ text, interim: true }`.
   *      Final chunk omits `interim` or sets `interim: false`.
   *
   * The NDJSON path lets the customer start TTS immediately on the first sentence
   * while their LLM is still generating the rest of the response.
   */
  private async *streamWebhookTurn(
    webhookUrl: string | null,
    payload: WebhookTurnPayload,
    timeoutSeconds: number,
  ): AsyncGenerator<TurnResult> {
    if (!webhookUrl) {
      yield { text: 'This agent has no webhook URL configured.', interim: false };
      return;
    }

    const body = JSON.stringify(payload);
    const signature = this.signPayload(body);
    const headers = {
      'Content-Type': 'application/json',
      'X-Vukho-Signature': `sha256=${signature}`,
    };

    // Two attempts: initial + one retry on network errors and 5xx.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(timeoutSeconds * 1000),
        });

        if (!response.ok) {
          // 4xx — not retryable; customer misconfiguration.
          if (response.status >= 400 && response.status < 500) {
            yield {
              text: 'I had trouble reaching the agent. Please try again later.',
              interim: false,
            };
            return;
          }
          // 5xx — retry once, then give up.
          if (attempt === 1) {
            yield {
              text: 'I had trouble reaching the agent. Please try again later.',
              interim: false,
            };
            return;
          }
          continue;
        }

        // ── Parse response ─────────────────────────────────────────────────
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('x-ndjson')) {
          yield* this.parseNdjsonStream(response);
        } else {
          const data = await response.json() as WebhookResponseChunk;
          yield this.parseResponseChunk(data, false);
        }
        return;

      } catch (err) {
        if (attempt === 1) {
          const isTimeout = err instanceof Error && err.name === 'TimeoutError';
          yield {
            text: isTimeout
              ? 'The agent took too long to respond. Please try again.'
              : 'I had trouble reaching the agent. Please try again later.',
            interim: false,
          };
          return;
        }
        // First attempt failed — retry
      }
    }
  }

  /**
   * Parse a streaming NDJSON response from the customer's server.
   * Yields each parsed chunk; marks the final one with `interim: false`.
   *
   * The customer server pattern:
   *   {"text": "One moment, let me check.", "interim": true}
   *   {"text": "Your order shipped yesterday."}
   */
  private async *parseNdjsonStream(response: Response): AsyncGenerator<TurnResult> {
    if (!response.body) {
      yield { text: '', interim: false };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let pending: TurnResult | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Last element may be an incomplete line — keep in buffer.
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed) as WebhookResponseChunk;
            // Emit the previous chunk before processing the new one.
            if (pending !== null) yield pending;
            // Keep as pending so we can force interim=false on the last chunk.
            pending = this.parseResponseChunk(data, data.interim === true);
          } catch {
            // Skip malformed lines — don't crash the turn
          }
        }
      }

      // Flush any remaining buffer content.
      const remaining = buffer.trim();
      if (remaining) {
        try {
          const data = JSON.parse(remaining) as WebhookResponseChunk;
          if (pending !== null) yield pending;
          pending = this.parseResponseChunk(data, data.interim === true);
        } catch { /* ignore */ }
      }
    } finally {
      reader.releaseLock();
    }

    // Emit final chunk — always with interim=false.
    if (pending !== null) {
      yield { ...pending, interim: false };
    } else {
      yield { text: '', interim: false };
    }
  }

  /**
   * Convert a raw webhook response object into a typed TurnResult.
   * Normalises snake_case / camelCase aliases.
   */
  private parseResponseChunk(data: WebhookResponseChunk, interim: boolean): TurnResult {
    const text = typeof data.text === 'string' ? data.text : '';
    const hangup = data.hangup === true || data.action === 'hangup';
    const isTransfer = data.action === 'transfer';
    const transferTo =
      typeof data.transferTo === 'string' ? data.transferTo :
      typeof data.transfer_to === 'string' ? data.transfer_to :
      undefined;
    const sendMessage =
      data.send_message && typeof data.send_message.body === 'string'
        ? { body: data.send_message.body }
        : undefined;
    const digits = typeof data.digits === 'string' ? data.digits : undefined;

    return {
      text,
      interim,
      ...(hangup && { hangup: true }),
      ...(isTransfer && { action: 'transfer' as const, transferTo }),
      ...(sendMessage && { sendMessage }),
      ...(digits && { digits }),
    };
  }

  // ─── Webhook: lifecycle events ─────────────────────────────────────────────

  /**
   * Fire a lifecycle event (call.started / call.ended) to the customer's webhook.
   * Best-effort — never throws, does not retry, 5 second hard timeout.
   * The call MUST NOT be blocked on this.
   */
  private async sendWebhookLifecycle(
    webhookUrl: string,
    payload: WebhookCallStartedPayload | WebhookCallEndedPayload,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.signPayload(body);
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vukho-Signature': `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // Lifecycle events are best-effort — failure is silently ignored
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private resolveVoice(voice: string | null | undefined, language: string): string {
    if (voice && VALID_SPEAKERS.has(voice)) return voice;
    return LANGUAGE_DEFAULT_SPEAKER[language] ?? 'ritu';
  }

  /**
   * HMAC-SHA256 sign a payload string using the webhook secret.
   * The signature is sent as `X-Vukho-Signature: sha256=<hex>`.
   */
  private signPayload(payload: string): string {
    const secret =
      (this.config.get<string>('VUKHO_WEBHOOK_SECRET_PEPPER') ?? '') +
      (this.config.get<string>('VUKHO_INTERNAL_SECRET') ?? '');
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Fetch the most recent transcript turns for a call (up to 20 turns = ~10 exchanges).
   * Used to populate `recentHistory` in the webhook turn payload.
   * Must be called BEFORE saving the current user turn.
   */
  private async fetchRecentHistory(
    callId: string,
  ): Promise<Array<{ role: 'user' | 'agent'; content: string }>> {
    const turns = await this.prisma.transcriptTurn.findMany({
      where: { callId },
      orderBy: { startedAtMs: 'asc' },
      take: 20,
      select: { speaker: true, text: true },
    });
    return turns.map((t) => ({
      role: t.speaker === 'user' ? 'user' : 'agent',
      content: t.text,
    }));
  }

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

    // LLM — hosted mode only; webhook mode runs the customer's own LLM.
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
        quantity: Math.round(totals.sttSeconds * 10) / 10,
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
