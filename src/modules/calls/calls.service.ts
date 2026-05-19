import { Inject, Injectable } from '@nestjs/common';
import { CallStatus, Prisma, type Call } from '@prisma/client';
import { createHash } from 'node:crypto';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { VukhoEvent, AuditAction, EventResourceType } from '../../domain/events';
import type { TelecomProvider } from '../../domain/provider';
import type { CreateCallInput, CreateWebCallInput, TransferCallInput } from '../../domain/schemas';
import { AuditService } from '../audit/audit.service';
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
    private readonly audit: AuditService,
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
          providerStatus: providerCall.status,
          providerErrorCode: null,
          providerErrorText: null,
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
        type:
          providerCall.status === 'completed' ? VukhoEvent.CallCompleted : VukhoEvent.CallStarted,
        resourceType: EventResourceType.Call,
        resourceId: call.id,
        payload: this.buildCallEventPayload(call, { providerStatus: providerCall.status }),
      });
      await this.webhooks.createDeliveriesForEvent(event);
      await this.recordCallAudit(context, AuditAction.CallCreated, call, {
        providerStatus: providerCall.status,
      });

      return serializeCall(call);
    } catch (error) {
      if (!providerStarted) {
        await this.usage.voidUsageForFailedOperation({
          workspaceId: context.workspaceId,
          resourceType: EventResourceType.Call,
          resourceId: callId,
        });
      }
      const failedCall = await this.prisma.call
        .update({
          where: { id: callId },
          data: {
            status: 'failed',
            endedAt: new Date(),
            ...this.providerFailureUpdate(error),
          },
        })
        .catch(() => undefined);
      if (failedCall) {
        const event = await this.events.create({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          type: VukhoEvent.CallFailed,
          resourceType: EventResourceType.Call,
          resourceId: failedCall.id,
          payload: this.buildCallEventPayload(failedCall, {
            failureReason: error instanceof Error ? error.message : 'Call failed.',
          }),
        });
        await this.webhooks.createDeliveriesForEvent(event);
        await this.recordCallAudit(context, AuditAction.CallFailed, failedCall, {
          failureReason: error instanceof Error ? error.message : 'Call failed.',
        });
      }
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
    const call = await this.findCallOrThrow(context, id);

    return {
      ...serializeCall(call),
      providerDiagnostics: await this.listProviderDiagnosticsForCall(call),
    };
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
        providerStatus: providerCall.status,
        endedAt: existing.endedAt ?? new Date(),
      },
    });

    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: VukhoEvent.CallEnded,
      resourceType: EventResourceType.Call,
      resourceId: call.id,
      payload: this.buildCallEventPayload(call, { providerStatus: providerCall.status }),
    });
    await this.webhooks.createDeliveriesForEvent(event);
    await this.recordCallAudit(context, AuditAction.CallEnded, call, {
      providerStatus: providerCall.status,
    });

    return serializeCall(call);
  }

  async receiveProviderCallStatus(input: {
    provider: 'twilio';
    providerCallId: string;
    status: string;
    durationSeconds?: number;
    providerErrorCode?: string;
    providerErrorText?: string;
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
      const settled = await this.settleTerminalCallbackWithoutLifecycleEvent(existing, {
        durationSeconds: input.durationSeconds,
        status,
        providerStatus: isTerminal ? input.status : undefined,
        providerErrorCode: isTerminal ? input.providerErrorCode : undefined,
        providerErrorText: isTerminal ? input.providerErrorText : undefined,
      });
      return { received: true, duplicate: false, ignored: true, call: serializeCall(settled) };
    }

    const nextStatus = this.nextProviderCallStatus(existing.status, status);
    const shouldUpdate =
      nextStatus !== existing.status || isTerminal || input.durationSeconds !== undefined;

    const call = await this.prisma.call.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        durationSeconds: input.durationSeconds ?? existing.durationSeconds,
        outcome: isTerminal ? nextStatus : existing.outcome,
        endedAt: isTerminal ? (existing.endedAt ?? new Date()) : existing.endedAt,
        providerStatus: input.status,
        providerErrorCode: input.providerErrorCode ?? null,
        providerErrorText: input.providerErrorText ?? null,
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
        type: this.callLifecycleEventType(nextStatus),
        resourceType: EventResourceType.Call,
        resourceId: call.id,
        payload: this.buildCallEventPayload(call, { providerStatus: input.status }),
      });
      await this.webhooks.createDeliveriesForEvent(event);
    } else if (shouldUpdate && nextStatus !== existing.status) {
      const event = await this.events.create({
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        type: this.callLifecycleEventType(nextStatus),
        resourceType: EventResourceType.Call,
        resourceId: call.id,
        payload: this.buildCallEventPayload(call, { providerStatus: input.status }),
      });
      await this.webhooks.createDeliveriesForEvent(event);
    }

    return serializeCall(call);
  }

  async receiveProviderInboundCall(input: {
    provider: 'twilio';
    providerCallId: string;
    from: string;
    to: string;
    status?: string;
    rawPayload: Record<string, unknown>;
  }) {
    const phoneNumber = await this.prisma.phoneNumber.findFirst({
      where: {
        provider: input.provider,
        phoneNumber: input.to,
        status: 'active',
        capabilities: { has: 'voice' },
        agentId: { not: null },
      },
    });

    if (!phoneNumber?.agentId) {
      return { received: true, ignored: true, reason: 'number_not_attached' };
    }

    const context: RequestContext = {
      workspaceId: phoneNumber.workspaceId,
      projectId: phoneNumber.projectId,
    };

    const existingCall = await this.prisma.call.findFirst({
      where: {
        provider: input.provider,
        providerCallId: input.providerCallId,
      },
    });

    if (existingCall) {
      await this.ensureLiveVoicePromptTranscript(existingCall);
      return { received: true, duplicate: true, ignored: false, call: serializeCall(existingCall) };
    }

    const recorded = await this.recordProviderRawEvent({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      provider: input.provider,
      providerEventId: `${input.providerCallId}:voice:inbound`,
      eventType: 'twilio.voice.inbound',
      payload: input.rawPayload,
    });

    if (!recorded) {
      const duplicateCall = await this.prisma.call.findFirst({
        where: {
          provider: input.provider,
          providerCallId: input.providerCallId,
        },
      });
      return {
        received: true,
        duplicate: true,
        ignored: false,
        call: duplicateCall ? serializeCall(duplicateCall) : undefined,
      };
    }

    const contact = await this.contacts.findOrCreateByPhoneNumber(context, input.from);
    const conversation = await this.conversations.findOrCreateVoiceConversation(
      context,
      phoneNumber.agentId,
      contact.id,
    );
    const callId = createId('call');
    const startedAt = new Date();
    const status = this.nextProviderCallStatus(
      'ringing',
      this.normalizeProviderCallStatus(input.status ?? 'in-progress'),
    );

    await this.usage.recordVoiceCall({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      agentId: phoneNumber.agentId,
      callId,
      durationSeconds: this.voicePreauthorizationSeconds,
    });

    const call = await this.prisma.call.create({
      data: {
        id: callId,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: phoneNumber.agentId,
        conversationId: conversation.id,
        phoneNumberId: phoneNumber.id,
        contactId: contact.id,
        direction: 'inbound',
        fromNumber: input.from,
        toNumber: input.to,
        status,
        durationSeconds: 0,
        provider: input.provider,
        providerCallId: input.providerCallId,
        providerStatus: input.status ?? 'in-progress',
        startedAt,
      },
    });

    await this.ensureLiveVoicePromptTranscript(call);

    const event = await this.events.create({
      workspaceId: call.workspaceId,
      projectId: call.projectId,
      type: VukhoEvent.CallStarted,
      resourceType: EventResourceType.Call,
      resourceId: call.id,
      payload: this.buildCallEventPayload(call, {
        providerStatus: input.status ?? 'in-progress',
        source: 'provider.inbound_voice',
      }),
    });
    await this.webhooks.createDeliveriesForEvent(event);
    await this.recordCallAudit(context, AuditAction.CallCreated, call, {
      providerStatus: input.status ?? 'in-progress',
      source: 'provider.inbound_voice',
    });

    return { received: true, ignored: false, call: serializeCall(call) };
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

    if (!this.terminalCallStatuses.has(call.status) && call.status !== 'in_progress') {
      const updated = await this.prisma.call.update({
        where: { id: call.id },
        data: {
          status: 'in_progress',
          startedAt: call.startedAt ?? new Date(),
          providerStatus: 'in-progress',
        },
      });
      const event = await this.events.create({
        workspaceId: updated.workspaceId,
        projectId: updated.projectId,
        type: VukhoEvent.CallStarted,
        resourceType: EventResourceType.Call,
        resourceId: updated.id,
        payload: this.buildCallEventPayload(updated, { providerStatus: 'in-progress' }),
      });
      await this.webhooks.createDeliveriesForEvent(event);
    }

    await this.ensureLiveVoicePromptTranscript(call);

    return { received: true, ignored: false };
  }

  async receiveProviderVoiceSpeech(input: {
    provider: 'twilio';
    providerCallId: string;
    speechResult: string;
    confidence?: number;
    rawPayload: Record<string, unknown>;
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

    const recorded = await this.recordProviderRawEvent({
      workspaceId: call.workspaceId,
      projectId: call.projectId,
      provider: input.provider,
      providerEventId: `${input.providerCallId}:voice:gather:${this.providerSpeechHash(
        text,
        input.confidence,
      )}`,
      eventType: 'twilio.voice.gather',
      payload: input.rawPayload,
    });

    const existingSpeech = await this.prisma.transcriptTurn.findFirst({
      where: {
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        callId: call.id,
        speaker: 'user',
        text,
      },
    });

    if (!recorded || existingSpeech) {
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

    const turn = await this.prisma.transcriptTurn.create({
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

    const shouldMarkInProgress =
      !this.terminalCallStatuses.has(call.status) && call.status !== 'in_progress';
    const updated = await this.prisma.call.update({
      where: { id: call.id },
      data: {
        status: shouldMarkInProgress ? 'in_progress' : call.status,
        startedAt: shouldMarkInProgress ? (call.startedAt ?? new Date()) : call.startedAt,
        providerStatus: shouldMarkInProgress ? 'in-progress' : call.providerStatus,
        summary: `Caller said: ${text}`,
        outcome: call.outcome ?? 'response_captured',
      },
    });

    if (shouldMarkInProgress) {
      const statusEvent = await this.events.create({
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        type: VukhoEvent.CallStatusUpdated,
        resourceType: EventResourceType.Call,
        resourceId: call.id,
        payload: this.buildCallEventPayload(updated, {
          providerStatus: 'in-progress',
          source: 'provider.voice_gather',
        }),
      });
      await this.webhooks.createDeliveriesForEvent(statusEvent);
    }

    const event = await this.events.create({
      workspaceId: call.workspaceId,
      projectId: call.projectId,
      type: VukhoEvent.CallTranscriptUpdated,
      resourceType: EventResourceType.Call,
      resourceId: call.id,
      payload: {
        ...this.buildCallEventPayload(updated),
        transcriptTurn: {
          id: turn.id,
          speaker: turn.speaker,
          text: turn.text,
          startedAtMs: turn.startedAtMs,
          endedAtMs: turn.endedAtMs,
          confidence: turn.confidence?.toString() ?? null,
        },
        source: 'provider.voice_gather',
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
        providerStatus: transfer.status,
        outcome: 'transferred',
        endedAt: existing.endedAt ?? new Date(),
      },
    });

    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: VukhoEvent.CallTransferred,
      resourceType: EventResourceType.Call,
      resourceId: call.id,
      payload: this.buildCallEventPayload(call, { transferTo: input.to }),
    });
    await this.webhooks.createDeliveriesForEvent(event);
    await this.recordCallAudit(context, AuditAction.CallTransferred, call, {
      transferTo: input.to,
    });

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
        text: 'Hi, this is your Vukho agent. I am calling to help with your request.',
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

  private async ensureLiveVoicePromptTranscript(
    call: Pick<Call, 'workspaceId' | 'projectId' | 'id'>,
  ) {
    const existingPrompt = await this.prisma.transcriptTurn.findFirst({
      where: {
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        callId: call.id,
        speaker: 'agent',
        startedAtMs: 0,
      },
    });

    if (existingPrompt) {
      return;
    }

    await this.prisma.transcriptTurn.create({
      data: {
        id: createId('trn'),
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        callId: call.id,
        speaker: 'agent',
        text: 'Hello from Vukho. This is your live phone agent. Please say a short reply after the tone.',
        startedAtMs: 0,
        endedAtMs: 5000,
        confidence: 1,
      },
    });
  }

  private normalizeProviderCallStatus(status: string): CallStatus {
    if (status === 'initiated') {
      return 'queued';
    }
    if (status === 'answered') {
      return 'in_progress';
    }
    if (status === 'in-progress') {
      return 'in_progress';
    }
    if (status === 'no-answer') {
      return 'no_answer';
    }
    if (
      status === 'queued' ||
      status === 'ringing' ||
      status === 'completed' ||
      status === 'failed'
    ) {
      return status;
    }
    if (status === 'busy' || status === 'canceled') {
      return status;
    }
    return 'queued';
  }

  private nextProviderCallStatus(
    currentStatus: CallStatus,
    providerStatus: CallStatus,
  ): CallStatus {
    if (this.terminalCallStatuses.has(currentStatus)) {
      return currentStatus;
    }

    const rank: Record<string, number> = {
      queued: 1,
      ringing: 2,
      in_progress: 3,
      completed: 4,
      failed: 4,
      busy: 4,
      no_answer: 4,
      canceled: 4,
      transferred: 4,
    };

    return (rank[providerStatus] ?? 0) >= (rank[currentStatus] ?? 0)
      ? providerStatus
      : currentStatus;
  }

  private callLifecycleEventType(status: string) {
    if (status === 'completed') {
      return VukhoEvent.CallCompleted;
    }
    if (status === 'failed') {
      return VukhoEvent.CallFailed;
    }
    if (this.terminalCallStatuses.has(status)) {
      return VukhoEvent.CallEnded;
    }
    if (status === 'in_progress') {
      return VukhoEvent.CallStarted;
    }
    return VukhoEvent.CallStatusUpdated;
  }

  private buildCallEventPayload(
    call: Pick<
      Call,
      | 'id'
      | 'agentId'
      | 'conversationId'
      | 'contactId'
      | 'phoneNumberId'
      | 'direction'
      | 'fromNumber'
      | 'toNumber'
      | 'status'
      | 'outcome'
      | 'summary'
      | 'durationSeconds'
      | 'provider'
      | 'providerCallId'
      | 'providerStatus'
      | 'providerErrorCode'
      | 'providerErrorText'
      | 'startedAt'
      | 'endedAt'
    >,
    extra: Record<string, unknown> = {},
  ) {
    return {
      agentId: call.agentId,
      callId: call.id,
      conversationId: call.conversationId,
      contactId: call.contactId,
      phoneNumberId: call.phoneNumberId,
      direction: call.direction,
      fromNumber: call.fromNumber,
      toNumber: call.toNumber,
      status: call.status,
      outcome: call.outcome,
      summary: call.summary,
      durationSeconds: call.durationSeconds,
      provider: call.provider,
      providerCallId: call.providerCallId,
      providerStatus: call.providerStatus,
      providerErrorCode: call.providerErrorCode,
      providerErrorText: call.providerErrorText,
      startedAt: call.startedAt?.toISOString() ?? null,
      endedAt: call.endedAt?.toISOString() ?? null,
      ...extra,
    };
  }

  private async recordCallAudit(
    context: RequestContext,
    action: string,
    call: Pick<
      Call,
      | 'id'
      | 'agentId'
      | 'conversationId'
      | 'contactId'
      | 'phoneNumberId'
      | 'direction'
      | 'fromNumber'
      | 'toNumber'
      | 'status'
      | 'outcome'
      | 'durationSeconds'
      | 'provider'
      | 'providerCallId'
    >,
    metadata: Record<string, unknown> = {},
  ) {
    await this.audit.record({
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorApiKeyId: context.apiKeyId,
      action,
      resourceType: EventResourceType.Call,
      resourceId: call.id,
      metadata: {
        projectId: context.projectId,
        agentId: call.agentId,
        conversationId: call.conversationId,
        contactId: call.contactId,
        phoneNumberId: call.phoneNumberId,
        direction: call.direction,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        status: call.status,
        outcome: call.outcome,
        durationSeconds: call.durationSeconds,
        provider: call.provider,
        providerCallId: call.providerCallId,
        ...metadata,
      },
    });
  }

  private async listProviderDiagnosticsForCall(call: {
    workspaceId: string;
    projectId: string;
    providerCallId: string | null;
  }) {
    if (!call.providerCallId) {
      return { events: [], issues: [] };
    }

    const events = await this.prisma.providerRawEvent.findMany({
      where: {
        workspaceId: call.workspaceId,
        projectId: call.projectId,
        providerEventId: { startsWith: call.providerCallId },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    const serialized = events.map((event) => {
      const status = this.getJsonString(event.payload, 'CallStatus');
      const code = this.getJsonString(event.payload, 'ErrorCode');
      const message =
        this.getJsonString(event.payload, 'ErrorMessage') ??
        this.getJsonString(event.payload, 'ErrorMessageText');

      return {
        id: event.id,
        provider: event.provider,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        status,
        code,
        message,
        createdAt: event.createdAt.toISOString(),
      };
    });

    return {
      events: serialized,
      issues: serialized.filter(
        (event) => this.isProviderIssueStatus(event.status) || event.code || event.message,
      ),
    };
  }

  private getJsonString(payload: Prisma.JsonValue, key: string) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }

    return null;
  }

  private isProviderIssueStatus(status: string | null) {
    return ['failed', 'busy', 'no-answer', 'no_answer', 'canceled'].includes(status ?? '');
  }

  private providerSpeechHash(text: string, confidence?: number) {
    return createHash('sha256')
      .update(`${text}:${Number.isFinite(confidence) ? confidence : ''}`)
      .digest('hex')
      .slice(0, 16);
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

  private async settleTerminalCallbackWithoutLifecycleEvent(
    existing: Call,
    input: {
      durationSeconds?: number;
      status: CallStatus;
      providerStatus?: string;
      providerErrorCode?: string;
      providerErrorText?: string;
    },
  ) {
    const shouldSettleDuration =
      input.durationSeconds !== undefined && input.durationSeconds > existing.durationSeconds;
    const shouldSettleStatus =
      this.terminalCallStatuses.has(input.status) && existing.status !== input.status;
    const shouldSetOutcome = !existing.outcome && this.terminalCallStatuses.has(input.status);
    const shouldSetEndedAt = !existing.endedAt && this.terminalCallStatuses.has(input.status);
    const shouldSetProviderDiagnostics =
      input.providerStatus !== undefined &&
      (existing.providerStatus !== input.providerStatus ||
        existing.providerErrorCode !== (input.providerErrorCode ?? null) ||
        existing.providerErrorText !== (input.providerErrorText ?? null));

    if (
      !shouldSettleDuration &&
      !shouldSettleStatus &&
      !shouldSetOutcome &&
      !shouldSetEndedAt &&
      !shouldSetProviderDiagnostics
    ) {
      return existing;
    }

    const call = await this.prisma.call.update({
      where: { id: existing.id },
      data: {
        status: shouldSettleStatus ? input.status : existing.status,
        durationSeconds: shouldSettleDuration ? input.durationSeconds : existing.durationSeconds,
        outcome: shouldSetOutcome ? input.status : existing.outcome,
        endedAt: shouldSetEndedAt ? new Date() : existing.endedAt,
        providerStatus: shouldSetProviderDiagnostics
          ? input.providerStatus
          : existing.providerStatus,
        providerErrorCode: shouldSetProviderDiagnostics
          ? (input.providerErrorCode ?? null)
          : existing.providerErrorCode,
        providerErrorText: shouldSetProviderDiagnostics
          ? (input.providerErrorText ?? null)
          : existing.providerErrorText,
      },
    });

    if (shouldSettleDuration) {
      await this.usage.finalizeVoiceCall({
        workspaceId: call.workspaceId,
        callId: call.id,
        durationSeconds: call.durationSeconds,
      });
    }

    return call;
  }

  private providerFailureUpdate(error: unknown) {
    if (error instanceof ApiException) {
      return {
        providerErrorCode: this.stringifyDetail(error.details.code),
        providerErrorText: this.stringifyDetail(error.details.message) ?? error.message,
      };
    }

    return {
      providerErrorCode: null,
      providerErrorText: error instanceof Error ? error.message : 'Provider request failed.',
    };
  }

  private stringifyDetail(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return null;
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
      throw new ApiException(
        'conflict',
        'Agent does not have an active voice-capable number.',
        409,
        {
          agentId,
        },
      );
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
