import { Injectable } from '@nestjs/common';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type { CreateCallInput, CreateWebCallInput, TransferCallInput } from '../../domain/schemas';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationsService } from '../conversations/conversations.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockProviderService } from '../providers/mock/mock-provider.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { serializeCall, serializeTranscriptTurn } from './calls.serializer';

@Injectable()
export class CallsService {
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
    private readonly mockProvider: MockProviderService,
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
    const providerCall = await this.mockProvider.createCall({
      from: phoneNumber.phoneNumber,
      to: input.to,
    });
    const now = new Date();

    const call = await this.prisma.call.create({
      data: {
        id: createId('call'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: agent.id,
        conversationId: conversation.id,
        phoneNumberId: phoneNumber.id,
        contactId: contact.id,
        direction: 'outbound',
        fromNumber: phoneNumber.phoneNumber,
        toNumber: input.to,
        status: providerCall.status,
        durationSeconds: providerCall.durationSeconds,
        summary: 'Mock call completed. The agent confirmed the caller intent and captured next step.',
        outcome: 'completed',
        provider: providerCall.provider,
        providerCallId: providerCall.providerCallId,
        startedAt: now,
        endedAt: new Date(now.getTime() + providerCall.durationSeconds * 1000),
      },
    });

    await this.createMockTranscript(context, call.id, input.to);
    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: 'agent.call.completed',
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
      ? await this.mockProvider.endCall({ providerCallId: existing.providerCallId })
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

  async transferCall(context: RequestContext, id: string, input: TransferCallInput) {
    const existing = await this.findCallOrThrow(context, id);

    if (!existing.providerCallId) {
      throw new ApiException('conflict', 'Call does not have a provider call id.', 409, { id });
    }

    const transfer = await this.mockProvider.transferCall({
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
