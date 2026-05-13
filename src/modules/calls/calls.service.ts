import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type { TelecomProvider } from '../../domain/provider';
import type { CreateCallInput, CreateWebCallInput, TransferCallInput } from '../../domain/schemas';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationsService } from '../conversations/conversations.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { TELECOM_PROVIDER } from '../providers/providers.constants';
import { UsageService } from '../usage/usage.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { serializeCall, serializeTranscriptTurn } from './calls.serializer';

@Injectable()
export class CallsService {
  private readonly voicePreauthorizationSeconds = 10 * 60;
  private readonly terminalCallStatuses = new Set([
    'completed',
    'failed',
    'busy',
    'no_answer',
    'canceled',
    'transferred',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
    private readonly events: EventsService,
    @Inject(TELECOM_PROVIDER) private readonly telecomProvider: TelecomProvider,
    private readonly usage: UsageService,
    private readonly webhooks: WebhooksService,
  ) {}

  async createOutboundCall(context: RequestContext, input: CreateCallInput) {
    const agent = await this.findAgentOrThrow(context, input.agentId);
    const phoneNumber = await this.findVoiceCapableNumberOrThrow(context, agent.id);
    const contact = await this.contacts.findOrCreateByPhoneNumber(context, input.to);
    const conversation = await this.conversations.findOrCreateVoiceConversation(
      context,
      agent.id,
      contact.id,
    );
    const now = new Date();

    const callId = createId('call');
    await this.usage.recordVoiceCall({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      agentId: agent.id,
      callId,
      durationSeconds: this.voicePreauthorizationSeconds,
    });

    let providerStarted = false;
    try {
      await this.prisma.call.create({
        data: {
          id: callId,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          agentId: agent.id,
          conversationId: conversation.id,
          phoneNumberId: phoneNumber.id,
          contactId: contact.id,
          direction: 'outbound',
          fromNumber: phoneNumber.phoneNumber,
          toNumber: input.to,
          status: 'queued',
          durationSeconds: 0,
          provider: phoneNumber.provider,
          startedAt: now,
        },
      });

      const providerCall = await this.telecomProvider.createCall({
        from: phoneNumber.phoneNumber,
        to: input.to,
      });
      providerStarted = true;
      await this.usage.finalizeVoiceCall({
        workspaceId: context.workspaceId,
        callId,
        durationSeconds: providerCall.durationSeconds,
      });

      const call = await this.prisma.call.update({
        where: { id: callId },
        data: {
          status: providerCall.status,
          durationSeconds: providerCall.durationSeconds,
          summary:
            providerCall.provider === 'mock'
              ? 'Mock call completed. The agent confirmed the caller intent and captured next step.'
              : null,
          outcome: this.terminalCallStatuses.has(providerCall.status) ? providerCall.status : null,
          provider: providerCall.provider,
          providerCallId: providerCall.providerCallId,
          endedAt: this.terminalCallStatuses.has(providerCall.status)
            ? new Date(now.getTime() + providerCall.durationSeconds * 1000)
            : null,
        },
      });

      if (providerCall.provider === 'mock') {
        await this.createMockTranscript(context, call.id, input.to);
      }
      const event = await this.events.create({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        type: providerCall.status === 'completed' ? 'agent.call.completed' : 'agent.call.started',
        resourceType: 'call',
        resourceId: call.id,
        payload: {
          agentId: agent.id,
          conversationId: conversation.id,
          contactId: contact.id,
          durationSeconds: call.durationSeconds,
        },
      });
      await this.webhooks.createDeliveriesForEvent(event);

      return serializeCall(call);
    } catch (error) {
      if (!providerStarted) {
        await this.usage.voidUsageForFailedOperation({
          workspaceId: context.workspaceId,
          resourceType: 'call',
          resourceId: callId,
        });
      }
      await this.prisma.call
        .update({
          where: { id: callId },
          data: { status: 'failed', endedAt: new Date() },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  async createWebCallToken(context: RequestContext, input: CreateWebCallInput) {
    await this.findAgentOrThrow(context, input.agentId);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    return {
      token: `mock_web_call_${createId('tok')}`,
      agentId: input.agentId,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async listCalls(context: RequestContext, limit: number) {
    const calls = await this.prisma.call.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return list(calls.map(serializeCall), { limit, nextCursor: null });
  }

  async getCall(context: RequestContext, id: string) {
    return serializeCall(await this.findCallOrThrow(context, id));
  }

  async endCall(context: RequestContext, id: string) {
    const existing = await this.findCallOrThrow(context, id);

    if (this.terminalCallStatuses.has(existing.status)) {
      return serializeCall(existing);
    }

    const providerCall = existing.providerCallId
      ? await this.telecomProvider.endCall({ providerCallId: existing.providerCallId })
      : { status: 'completed' as const };

    const call = await this.prisma.call.update({
      where: { id },
      data: {
        status: providerCall.status,
        endedAt: existing.endedAt ?? new Date(),
      },
    });

    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: 'agent.call.ended',
      resourceType: 'call',
      resourceId: call.id,
      payload: { agentId: call.agentId, conversationId: call.conversationId },
    });
    await this.webhooks.createDeliveriesForEvent(event);

    return serializeCall(call);
  }

  async receiveProviderCallStatus(input: {
    provider: 'twilio';
    providerCallId: string;
    status: string;
    durationSeconds?: number;
    rawPayload: Record<string, unknown>;
  }) {
    const status = this.normalizeProviderCallStatus(input.status);
    const existing = await this.prisma.call.findFirst({
      where: {
        provider: input.provider,
        providerCallId: input.providerCallId,
      },
    });

    if (!existing) {
      return { received: true, ignored: true, reason: 'call_not_found' };
    }

    const isTerminal = this.terminalCallStatuses.has(status);
    const recorded = await this.recordProviderRawEvent({
      workspaceId: existing.workspaceId,
      projectId: existing.projectId,
      provider: input.provider,
      providerEventId: `${input.providerCallId}:status:${input.status}`,
      eventType: 'twilio.voice.status',
      payload: input.rawPayload,
    });
    if (!recorded) {
      return { received: true, duplicate: true, ignored: false, call: serializeCall(existing) };
    }

    if (this.terminalCallStatuses.has(existing.status)) {
      return { received: true, duplicate: false, ignored: true, call: serializeCall(existing) };
    }

    const call = await this.prisma.call.update({
      where: { id: existing.id },
      data: {
        status,
        durationSeconds: input.durationSeconds ?? existing.durationSeconds,
        outcome: isTerminal ? status : existing.outcome,
        endedAt: isTerminal ? existing.endedAt ?? new Date() : existing.endedAt,
      },
    });

    if (isTerminal) {
      await this.usage.finalizeVoiceCall({
        workspaceId: call.workspaceId,
        callId: call.id,
        durationSeconds: call.durationSeconds,
      });

      const event = await this.events.create({
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        type: 'agent.call.ended',
        resourceType: 'call',
        resourceId: call.id,
        payload: {
          agentId: call.agentId,
          conversationId: call.conversationId,
          providerCallId: input.providerCallId,
          providerStatus: input.status,
          durationSeconds: call.durationSeconds,
        },
      });
      await this.webhooks.createDeliveriesForEvent(event);
    }

    return serializeCall(call);
  }

  async receiveProviderVoicePrompt(input: { provider: 'twilio'; providerCallId: string }) {
    const call = await this.prisma.call.findFirst({
      where: {
        provider: input.provider,
        providerCallId: input.providerCallId,
      },
    });

    if (!call) {
      return { received: true, ignored: true, reason: 'call_not_found' };
    }

    const existingPrompt = await this.prisma.transcriptTurn.findFirst({
      where: {
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        callId: call.id,
        speaker: 'agent',
        startedAtMs: 0,
      },
    });

    if (!existingPrompt) {
      await this.prisma.transcriptTurn.create({
        data: {
          id: createId('trn'),
          workspaceId: call.workspaceId,
          projectId: call.projectId,
          callId: call.id,
          speaker: 'agent',
          text: 'Hello from AgentLine. This is your live phone agent. Please say a short reply after the tone.',
          startedAtMs: 0,
          endedAtMs: 5000,
          confidence: 1,
        },
      });
    }

    return { received: true, ignored: false };
  }

  async receiveProviderVoiceSpeech(input: {
    provider: 'twilio';
    providerCallId: string;
    speechResult: string;
    confidence?: number;
  }) {
    const text = input.speechResult.trim();
    if (!text) {
      return { received: true, ignored: true, reason: 'empty_speech' };
    }

    const call = await this.prisma.call.findFirst({
      where: {
        provider: input.provider,
        providerCallId: input.providerCallId,
      },
    });

    if (!call) {
      return { received: true, ignored: true, reason: 'call_not_found' };
    }

    const existingSpeech = await this.prisma.transcriptTurn.findFirst({
      where: {
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        callId: call.id,
        speaker: 'user',
        text,
      },
    });

    if (existingSpeech) {
      return { received: true, duplicate: true, ignored: false };
    }

    const lastTurn = await this.prisma.transcriptTurn.findFirst({
      where: {
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        callId: call.id,
      },
      orderBy: { endedAtMs: 'desc' },
    });
    const startedAtMs = Math.max(lastTurn?.endedAtMs ?? 0, 5000);
    const endedAtMs = startedAtMs + Math.max(1000, Math.min(text.length * 80, 10000));

    await this.prisma.transcriptTurn.create({
      data: {
        id: createId('trn'),
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        callId: call.id,
        speaker: 'user',
        text,
        startedAtMs,
        endedAtMs,
        confidence: Number.isFinite(input.confidence) ? input.confidence : null,
      },
    });

    const updated = await this.prisma.call.update({
      where: { id: call.id },
      data: {
        summary: `Caller said: ${text}`,
        outcome: call.outcome ?? 'response_captured',
      },
    });

    const event = await this.events.create({
      workspaceId: call.workspaceId,
      projectId: call.projectId,
      type: 'agent.call.transcript_updated',
      resourceType: 'call',
      resourceId: call.id,
      payload: {
        agentId: call.agentId,
        conversationId: call.conversationId,
        providerCallId: input.providerCallId,
      },
    });
    await this.webhooks.createDeliveriesForEvent(event);

    return { received: true, ignored: false, call: serializeCall(updated) };
  }

  async transferCall(context: RequestContext, id: string, input: TransferCallInput) {
    const existing = await this.findCallOrThrow(context, id);

    if (!existing.providerCallId) {
      throw new ApiException('conflict', 'Call does not have a provider call id.', 409, { id });
    }

    const transfer = await this.telecomProvider.transferCall({
      providerCallId: existing.providerCallId,
      to: input.to,
    });

    const call = await this.prisma.call.update({
      where: { id },
      data: {
        status: transfer.status,
        outcome: 'transferred',
        endedAt: existing.endedAt ?? new Date(),
      },
    });

    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: 'agent.call.transferred',
      resourceType: 'call',
      resourceId: call.id,
      payload: { agentId: call.agentId, conversationId: call.conversationId, to: input.to },
    });
    await this.webhooks.createDeliveriesForEvent(event);

    return serializeCall(call);
  }

  async listTranscript(context: RequestContext, callId: string) {
    await this.findCallOrThrow(context, callId);
    const turns = await this.prisma.transcriptTurn.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        callId,
      },
      orderBy: { startedAtMs: 'asc' },
    });

    return list(turns.map(serializeTranscriptTurn), {
      limit: turns.length,
      nextCursor: null,
    });
  }

  private async createMockTranscript(context: RequestContext, callId: string, phoneNumber: string) {
    const turns = [
      {
        speaker: 'agent' as const,
        text: 'Hi, this is your AgentLine agent. I am calling to help with your request.',
        startedAtMs: 0,
        endedAtMs: 5200,
      },
      {
        speaker: 'user' as const,
        text: `This is ${phoneNumber}. I can confirm the request and next step.`,
        startedAtMs: 5600,
        endedAtMs: 11200,
      },
      {
        speaker: 'agent' as const,
        text: 'Thanks. I captured the outcome and will send it back to the connected workflow.',
        startedAtMs: 11600,
        endedAtMs: 17200,
      },
    ];

    await this.prisma.transcriptTurn.createMany({
      data: turns.map((turn) => ({
        id: createId('trn'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        callId,
        speaker: turn.speaker,
        text: turn.text,
        startedAtMs: turn.startedAtMs,
        endedAtMs: turn.endedAtMs,
        confidence: 0.99,
      })),
    });
  }

  private normalizeProviderCallStatus(status: string) {
    if (status === 'in-progress') {
      return 'in_progress';
    }
    if (status === 'no-answer') {
      return 'no_answer';
    }
    if (status === 'queued' || status === 'ringing' || status === 'completed' || status === 'failed') {
      return status;
    }
    if (status === 'busy' || status === 'canceled') {
      return status;
    }
    return 'queued';
  }

  private async recordProviderRawEvent(input: {
    workspaceId: string;
    projectId: string;
    provider: 'twilio';
    providerEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }) {
    try {
      await this.prisma.providerRawEvent.create({
        data: {
          id: createId('prevt'),
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          provider: input.provider,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          payload: input.payload as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  private async findAgentOrThrow(context: RequestContext, agentId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        id: agentId,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        status: 'active',
      },
      select: { id: true },
    });

    if (!agent) {
      throw new ApiException('not_found', 'Agent not found.', 404, { agentId });
    }

    return agent;
  }

  private async findVoiceCapableNumberOrThrow(context: RequestContext, agentId: string) {
    const phoneNumber = await this.prisma.phoneNumber.findFirst({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId,
        status: 'active',
        capabilities: { has: 'voice' },
      },
    });

    if (!phoneNumber) {
      throw new ApiException('conflict', 'Agent does not have an active voice-capable number.', 409, {
        agentId,
      });
    }

    return phoneNumber;
  }

  private async findCallOrThrow(context: RequestContext, id: string) {
    const call = await this.prisma.call.findFirst({
      where: {
        id,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
    });

    if (!call) {
      throw new ApiException('not_found', 'Call not found.', 404, { id });
    }

    return call;
  }
}
