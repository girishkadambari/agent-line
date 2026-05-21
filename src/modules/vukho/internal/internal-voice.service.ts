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

  async handleTurn(callSid: string, transcript: string): Promise<TurnResult> {
    const call = await this.prisma.call.findFirst({
      where: { providerCallId: callSid },
      include: { agent: true },
    });

    if (!call) {
      throw new ApiException('not_found', `No call found for callSid: ${callSid}`, 404);
    }

    await this.saveTranscriptTurn(call.id, call.workspaceId, call.projectId, 'user', transcript);

    let responseText: string;

    if (call.agent.mode === AgentMode.webhook) {
      responseText = await this.forwardToWebhook(call.agent.webhookUrl, callSid, transcript);
    } else if (call.agent.mode === AgentMode.hosted) {
      responseText = await this.hostedLlm.generateResponse(
        callSid,
        call.agent.systemPrompt ?? '',
        transcript,
      );
    } else {
      responseText = 'I am not configured to handle calls.';
    }

    await this.saveTranscriptTurn(call.id, call.workspaceId, call.projectId, 'agent', responseText);

    return { text: responseText, interim: false };
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

  private async forwardToWebhook(
    webhookUrl: string | null,
    callSid: string,
    transcript: string,
  ): Promise<string> {
    if (!webhookUrl) {
      return 'This agent has no webhook configured.';
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callSid, transcript }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        return 'I had trouble reaching the agent. Please try again.';
      }

      const data = (await response.json()) as Record<string, unknown>;
      return typeof data.text === 'string' ? data.text : '';
    } catch {
      return 'I had trouble reaching the agent. Please try again.';
    }
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
