import type { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { ContactsService } from '../contacts/contacts.service';
import type { ConversationsService } from '../conversations/conversations.service';
import type { EventsService } from '../events/events.service';
import { MockProviderService } from '../providers/mock/mock-provider.service';
import type { TelecomProvider } from '../../domain/provider';
import type { UsageService } from '../usage/usage.service';
import type { WebhooksService } from '../webhooks/webhooks.service';
import { CallsService } from './calls.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

const now = new Date('2026-05-06T00:00:00.000Z');

function callFixture(overrides = {}) {
  return {
    id: 'call_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    conversationId: 'conv_123',
    phoneNumberId: 'num_123',
    contactId: 'ctc_123',
    direction: 'outbound',
    fromNumber: '+14155551000',
    toNumber: '+14155550100',
    status: 'completed',
    durationSeconds: 64,
    summary: 'Mock call completed.',
    outcome: 'completed',
    recordingId: null,
    provider: 'mock',
    providerCallId: 'mock_call_123',
    providerStatus: 'completed',
    providerErrorCode: null,
    providerErrorText: null,
    startedAt: now,
    endedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function transcriptTurnFixture(overrides = {}) {
  return {
    id: 'trn_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    callId: 'call_123',
    speaker: 'agent',
    text: 'Hello',
    startedAtMs: 0,
    endedAtMs: 1000,
    confidence: 0.99,
    createdAt: now,
    ...overrides,
  };
}

function createService(prisma: PrismaService, providerOverride?: TelecomProvider) {
  const contacts = {
    findOrCreateByPhoneNumber: jest.fn().mockResolvedValue({ id: 'ctc_123' }),
  } as unknown as ContactsService;
  const conversations = {
    findOrCreateVoiceConversation: jest.fn().mockResolvedValue({ id: 'conv_123' }),
  } as unknown as ConversationsService;
  const events = {
    create: jest.fn().mockResolvedValue({ id: 'evt_123' }),
  } as unknown as EventsService;
  const webhooks = {
    createDeliveriesForEvent: jest.fn().mockResolvedValue([]),
  } as unknown as WebhooksService;
  const usage = {
    recordVoiceCall: jest.fn().mockResolvedValue({ id: 'use_123' }),
    finalizeVoiceCall: jest.fn().mockResolvedValue({ finalized: true, deltaCents: -24 }),
    voidUsageForFailedOperation: jest.fn().mockResolvedValue({ voided: true, refundedCents: 3 }),
  } as unknown as UsageService;
  const audit = {
    record: jest.fn().mockResolvedValue({ id: 'audit_123' }),
  } as unknown as AuditService;
  const provider = providerOverride ?? new MockProviderService();

  return {
    service: new CallsService(
      prisma,
      contacts,
      conversations,
      events,
      provider,
      usage,
      webhooks,
      audit,
    ),
    contacts,
    conversations,
    events,
    usage,
    webhooks,
    audit,
  };
}

describe('CallsService', () => {
  it('creates outbound mock call, transcript, and completed event', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'num_123',
          phoneNumber: '+14155551000',
        }),
      },
      call: {
        create: jest.fn().mockResolvedValue(callFixture({ status: 'queued' })),
        update: jest.fn().mockResolvedValue(callFixture()),
      },
      transcriptTurn: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    } as unknown as PrismaService;
    const { service, events, usage, audit } = createService(prisma);

    const result = await service.createOutboundCall(context, {
      agentId: 'agt_123',
      to: '+14155550100',
    });

    expect(result.status).toBe('completed');
    expect(usage.recordVoiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: 600,
      }),
    );
    expect(usage.finalizeVoiceCall).toHaveBeenCalledWith({
      workspaceId: context.workspaceId,
      callId: expect.any(String),
      durationSeconds: 64,
    });
    expect(prisma.transcriptTurn.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          callId: 'call_123',
        }),
      ]),
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.completed',
        resourceType: 'call',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: context.workspaceId,
        actorApiKeyId: context.apiKeyId,
        action: 'call.created',
        resourceType: 'call',
        resourceId: 'call_123',
        metadata: expect.objectContaining({
          projectId: context.projectId,
          agentId: 'agt_123',
          status: 'completed',
          provider: 'mock',
          providerStatus: 'completed',
        }),
      }),
    );
  });

  it('requires an attached voice-capable number', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    await expect(
      service.createOutboundCall(context, {
        agentId: 'agt_123',
        to: '+14155550100',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('does not create call when usage debit fails', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'num_123',
          phoneNumber: '+14155551000',
        }),
      },
      call: {
        create: jest.fn(),
      },
      transcriptTurn: {
        createMany: jest.fn(),
      },
    } as unknown as PrismaService;
    const { service, usage } = createService(prisma);
    jest.spyOn(usage, 'recordVoiceCall').mockRejectedValue(new Error('insufficient balance'));

    await expect(
      service.createOutboundCall(context, {
        agentId: 'agt_123',
        to: '+14155550100',
      }),
    ).rejects.toThrow('insufficient balance');
    expect(prisma.call.create).not.toHaveBeenCalled();
    expect(prisma.transcriptTurn.createMany).not.toHaveBeenCalled();
  });

  it('emits a failed call event when provider creation fails after local call creation', async () => {
    const provider = {
      createCall: jest.fn().mockRejectedValue(new Error('provider failed')),
    } as unknown as TelecomProvider;
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'num_123',
          phoneNumber: '+14155551000',
          provider: 'twilio',
        }),
      },
      call: {
        create: jest.fn().mockResolvedValue(callFixture({ status: 'queued', provider: 'twilio' })),
        update: jest.fn().mockResolvedValue(callFixture({ status: 'failed', provider: 'twilio' })),
      },
      transcriptTurn: {
        createMany: jest.fn(),
      },
    } as unknown as PrismaService;
    const { service, events, usage, webhooks } = createService(prisma, provider);

    await expect(
      service.createOutboundCall(context, {
        agentId: 'agt_123',
        to: '+14155550100',
      }),
    ).rejects.toThrow('provider failed');

    expect(usage.voidUsageForFailedOperation).toHaveBeenCalledWith({
      workspaceId: context.workspaceId,
      resourceType: 'call',
      resourceId: expect.any(String),
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.failed',
        resourceType: 'call',
        payload: expect.objectContaining({
          callId: 'call_123',
          status: 'failed',
          failureReason: 'provider failed',
        }),
      }),
    );
    expect(webhooks.createDeliveriesForEvent).toHaveBeenCalledWith({ id: 'evt_123' });
  });

  it('lists transcript turns for a scoped call', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(callFixture()),
      },
      transcriptTurn: {
        findMany: jest.fn().mockResolvedValue([transcriptTurnFixture()]),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.listTranscript(context, 'call_123');

    expect(result.data).toHaveLength(1);
    expect(prisma.transcriptTurn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          callId: 'call_123',
        }),
      }),
    );
  });

  it('transfers call and records transfer event', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(callFixture()),
        update: jest.fn().mockResolvedValue(callFixture({ status: 'transferred' })),
      },
    } as unknown as PrismaService;
    const { service, events, audit } = createService(prisma);

    const result = await service.transferCall(context, 'call_123', { to: '+14155550200' });

    expect(result.status).toBe('transferred');
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.transferred',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'call.transferred',
        resourceType: 'call',
        resourceId: 'call_123',
        metadata: expect.objectContaining({
          transferTo: '+14155550200',
        }),
      }),
    );
  });

  it('does not emit another event when ending an already terminal call', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(callFixture({ status: 'completed' })),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const { service, events } = createService(prisma);

    const result = await service.endCall(context, 'call_123');

    expect(result.status).toBe('completed');
    expect(prisma.call.update).not.toHaveBeenCalled();
    expect(events.create).not.toHaveBeenCalled();
  });

  it('records a live Twilio prompt transcript turn once', async () => {
    const prisma = {
      call: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            callFixture({ provider: 'twilio', providerCallId: 'CA123', status: 'ringing' }),
          ),
        update: jest
          .fn()
          .mockResolvedValue(
            callFixture({ provider: 'twilio', providerCallId: 'CA123', status: 'in_progress' }),
          ),
      },
      transcriptTurn: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(transcriptTurnFixture()),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    await service.receiveProviderVoicePrompt({
      provider: 'twilio',
      providerCallId: 'CA123',
    });

    expect(prisma.transcriptTurn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callId: 'call_123',
        speaker: 'agent',
        startedAtMs: 0,
      }),
    });
    expect(prisma.call.update).toHaveBeenCalledWith({
      where: { id: 'call_123' },
      data: expect.objectContaining({ status: 'in_progress' }),
    });
  });

  it('creates a live inbound Twilio call from the called Vukho number', async () => {
    const inboundCall = callFixture({
      id: 'call_inbound',
      provider: 'twilio',
      providerCallId: 'CA123',
      direction: 'inbound',
      fromNumber: '+14155550100',
      toNumber: '+14155551000',
      status: 'in_progress',
      durationSeconds: 0,
      endedAt: null,
    });
    const prisma = {
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'num_123',
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          agentId: 'agt_123',
          phoneNumber: '+14155551000',
          provider: 'twilio',
        }),
      },
      call: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(inboundCall),
      },
      providerRawEvent: {
        create: jest.fn().mockResolvedValue({ id: 'prevt_123' }),
      },
      transcriptTurn: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(transcriptTurnFixture({ callId: 'call_inbound' })),
      },
    } as unknown as PrismaService;
    const { service, contacts, conversations, events, usage, audit } = createService(prisma);

    const result = await service.receiveProviderInboundCall({
      provider: 'twilio',
      providerCallId: 'CA123',
      from: '+14155550100',
      to: '+14155551000',
      status: 'in-progress',
      rawPayload: { CallSid: 'CA123', From: '+14155550100', To: '+14155551000' },
    });

    expect(result).toMatchObject({
      received: true,
      ignored: false,
      call: expect.objectContaining({
        id: 'call_inbound',
        direction: 'inbound',
        status: 'in_progress',
      }),
    });
    expect(contacts.findOrCreateByPhoneNumber).toHaveBeenCalledWith(
      { workspaceId: context.workspaceId, projectId: context.projectId },
      '+14155550100',
    );
    expect(conversations.findOrCreateVoiceConversation).toHaveBeenCalledWith(
      { workspaceId: context.workspaceId, projectId: context.projectId },
      'agt_123',
      'ctc_123',
    );
    expect(usage.recordVoiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: 'agt_123',
        durationSeconds: 600,
      }),
    );
    expect(prisma.call.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentId: 'agt_123',
        phoneNumberId: 'num_123',
        direction: 'inbound',
        fromNumber: '+14155550100',
        toNumber: '+14155551000',
        provider: 'twilio',
        providerCallId: 'CA123',
        status: 'in_progress',
      }),
    });
    expect(prisma.providerRawEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerEventId: 'CA123:voice:inbound',
        eventType: 'twilio.voice.inbound',
      }),
    });
    expect(prisma.transcriptTurn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callId: 'call_inbound',
        speaker: 'agent',
        startedAtMs: 0,
      }),
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.started',
        resourceType: 'call',
        payload: expect.objectContaining({
          direction: 'inbound',
          source: 'provider.inbound_voice',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'call.created',
        metadata: expect.objectContaining({
          direction: 'inbound',
          source: 'provider.inbound_voice',
        }),
      }),
    );
  });

  it('does not duplicate a live inbound Twilio call when the provider retries', async () => {
    const prisma = {
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'num_123',
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          agentId: 'agt_123',
          phoneNumber: '+14155551000',
          provider: 'twilio',
        }),
      },
      call: {
        findFirst: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            direction: 'inbound',
          }),
        ),
        create: jest.fn(),
      },
      providerRawEvent: {
        create: jest.fn(),
      },
      transcriptTurn: {
        findFirst: jest.fn().mockResolvedValue(transcriptTurnFixture()),
        create: jest.fn(),
      },
    } as unknown as PrismaService;
    const { service, events, usage } = createService(prisma);

    const result = await service.receiveProviderInboundCall({
      provider: 'twilio',
      providerCallId: 'CA123',
      from: '+14155550100',
      to: '+14155551000',
      rawPayload: { CallSid: 'CA123' },
    });

    expect(result).toMatchObject({ received: true, duplicate: true, ignored: false });
    expect(prisma.call.create).not.toHaveBeenCalled();
    expect(prisma.providerRawEvent.create).not.toHaveBeenCalled();
    expect(usage.recordVoiceCall).not.toHaveBeenCalled();
    expect(events.create).not.toHaveBeenCalled();
  });

  it('records live Twilio speech as a transcript turn and emits an update event', async () => {
    const prisma = {
      call: {
        findFirst: jest
          .fn()
          .mockResolvedValue(callFixture({ provider: 'twilio', providerCallId: 'CA123' })),
        update: jest
          .fn()
          .mockResolvedValue(callFixture({ summary: 'Caller said: Hello Vukho' })),
      },
      transcriptTurn: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(transcriptTurnFixture({ endedAtMs: 5000 })),
        create: jest
          .fn()
          .mockResolvedValue(transcriptTurnFixture({ speaker: 'user', text: 'Hello Vukho' })),
      },
    } as unknown as PrismaService;
    const { service, events } = createService(prisma);

    await service.receiveProviderVoiceSpeech({
      provider: 'twilio',
      providerCallId: 'CA123',
      speechResult: 'Hello Vukho',
      confidence: 0.92,
    });

    expect(prisma.transcriptTurn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callId: 'call_123',
        speaker: 'user',
        text: 'Hello Vukho',
        confidence: 0.92,
      }),
    });
    expect(prisma.call.update).toHaveBeenCalledWith({
      where: { id: 'call_123' },
      data: expect.objectContaining({
        summary: 'Caller said: Hello Vukho',
      }),
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.transcript_updated',
      }),
    );
  });

  it('records Twilio answered status as in progress and emits a started event', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'ringing',
            durationSeconds: 0,
            endedAt: null,
          }),
        ),
        update: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'in_progress',
            durationSeconds: 0,
            endedAt: null,
          }),
        ),
      },
      providerRawEvent: {
        create: jest.fn().mockResolvedValue({ id: 'prevt_123' }),
      },
    } as unknown as PrismaService;
    const { service, events, usage } = createService(prisma);

    const result = await service.receiveProviderCallStatus({
      provider: 'twilio',
      providerCallId: 'CA123',
      status: 'answered',
      rawPayload: { CallSid: 'CA123', CallStatus: 'answered' },
    });

    expect('status' in result ? result.status : undefined).toBe('in_progress');
    expect(prisma.call.update).toHaveBeenCalledWith({
      where: { id: 'call_123' },
      data: expect.objectContaining({
        status: 'in_progress',
        endedAt: null,
      }),
    });
    expect(usage.finalizeVoiceCall).not.toHaveBeenCalled();
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.started',
      }),
    );
  });

  it('records Twilio terminal status once and emits one completed event', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'in_progress',
            durationSeconds: 0,
          }),
        ),
        update: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'completed',
            durationSeconds: 42,
          }),
        ),
      },
      providerRawEvent: {
        create: jest.fn().mockResolvedValue({ id: 'prevt_123' }),
      },
    } as unknown as PrismaService;
    const { service, events, usage } = createService(prisma);

    await service.receiveProviderCallStatus({
      provider: 'twilio',
      providerCallId: 'CA123',
      status: 'completed',
      durationSeconds: 42,
      rawPayload: { CallSid: 'CA123', CallStatus: 'completed' },
    });

    expect(prisma.providerRawEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerEventId: 'CA123:status:completed',
        eventType: 'twilio.voice.status',
      }),
    });
    expect(usage.finalizeVoiceCall).toHaveBeenCalledWith({
      workspaceId: context.workspaceId,
      callId: 'call_123',
      durationSeconds: 42,
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.completed',
      }),
    );
  });

  it('stores provider failure details from Twilio call status callbacks', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'in_progress',
            durationSeconds: 0,
          }),
        ),
        update: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'failed',
            durationSeconds: 3,
            outcome: 'failed',
            providerStatus: 'failed',
            providerErrorCode: '13224',
            providerErrorText: 'Call could not be completed.',
          }),
        ),
      },
      providerRawEvent: {
        create: jest.fn().mockResolvedValue({ id: 'prevt_123' }),
      },
    } as unknown as PrismaService;
    const { service, events, usage } = createService(prisma);

    const result = await service.receiveProviderCallStatus({
      provider: 'twilio',
      providerCallId: 'CA123',
      status: 'failed',
      durationSeconds: 3,
      providerErrorCode: '13224',
      providerErrorText: 'Call could not be completed.',
      rawPayload: {
        CallSid: 'CA123',
        CallStatus: 'failed',
        CallDuration: '3',
        ErrorCode: '13224',
        ErrorMessage: 'Call could not be completed.',
      },
    });

    expect(result).toMatchObject({
      status: 'failed',
      providerStatus: 'failed',
      providerErrorCode: '13224',
      providerErrorText: 'Call could not be completed.',
    });
    expect(prisma.call.update).toHaveBeenCalledWith({
      where: { id: 'call_123' },
      data: expect.objectContaining({
        status: 'failed',
        durationSeconds: 3,
        outcome: 'failed',
        providerStatus: 'failed',
        providerErrorCode: '13224',
        providerErrorText: 'Call could not be completed.',
      }),
    });
    expect(usage.finalizeVoiceCall).toHaveBeenCalledWith({
      workspaceId: context.workspaceId,
      callId: 'call_123',
      durationSeconds: 3,
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.failed',
        payload: expect.objectContaining({
          providerStatus: 'failed',
          providerErrorCode: '13224',
          providerErrorText: 'Call could not be completed.',
        }),
      }),
    );
  });

  it('returns provider diagnostics on call detail', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'failed',
          }),
        ),
      },
      providerRawEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'prevt_123',
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            provider: 'twilio',
            eventType: 'twilio.voice.status',
            providerEventId: 'CA123:status:failed',
            payload: {
              CallSid: 'CA123',
              CallStatus: 'failed',
              ErrorCode: '13224',
              ErrorMessage: 'Call could not be completed.',
            },
            createdAt: now,
          },
        ]),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.getCall(context, 'call_123');

    expect(result.providerDiagnostics.issues[0]).toMatchObject({
      status: 'failed',
      code: '13224',
      message: 'Call could not be completed.',
    });
  });

  it('suppresses duplicate Twilio status callbacks before webhook emission', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'completed',
          }),
        ),
        update: jest.fn(),
      },
      providerRawEvent: {
        create: jest.fn().mockRejectedValue(duplicateError),
      },
    } as unknown as PrismaService;
    const { service, events, usage } = createService(prisma);

    const result = await service.receiveProviderCallStatus({
      provider: 'twilio',
      providerCallId: 'CA123',
      status: 'completed',
      durationSeconds: 42,
      rawPayload: { CallSid: 'CA123', CallStatus: 'completed' },
    });

    expect(result).toMatchObject({ duplicate: true, ignored: false });
    expect(prisma.call.update).not.toHaveBeenCalled();
    expect(usage.finalizeVoiceCall).not.toHaveBeenCalled();
    expect(events.create).not.toHaveBeenCalled();
  });

  it('does not regress an already terminal call from a late provider callback', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'completed',
          }),
        ),
        update: jest.fn(),
      },
      providerRawEvent: {
        create: jest.fn().mockResolvedValue({ id: 'prevt_123' }),
      },
    } as unknown as PrismaService;
    const { service, events, usage } = createService(prisma);

    const result = await service.receiveProviderCallStatus({
      provider: 'twilio',
      providerCallId: 'CA123',
      status: 'ringing',
      rawPayload: { CallSid: 'CA123', CallStatus: 'ringing' },
    });

    expect(result).toMatchObject({ duplicate: false, ignored: true });
    expect(prisma.call.update).not.toHaveBeenCalled();
    expect(usage.finalizeVoiceCall).not.toHaveBeenCalled();
    expect(events.create).not.toHaveBeenCalled();
  });

  it('settles late Twilio terminal duration without duplicate lifecycle event', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'completed',
            durationSeconds: 0,
            outcome: null,
            endedAt: null,
          }),
        ),
        update: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'completed',
            durationSeconds: 37,
            outcome: 'completed',
          }),
        ),
      },
      providerRawEvent: {
        create: jest.fn().mockResolvedValue({ id: 'prevt_123' }),
      },
    } as unknown as PrismaService;
    const { service, events, usage } = createService(prisma);

    const result = await service.receiveProviderCallStatus({
      provider: 'twilio',
      providerCallId: 'CA123',
      status: 'completed',
      durationSeconds: 37,
      rawPayload: { CallSid: 'CA123', CallStatus: 'completed', CallDuration: '37' },
    });

    expect(result).toMatchObject({ ignored: true });
    expect(prisma.call.update).toHaveBeenCalledWith({
      where: { id: 'call_123' },
      data: expect.objectContaining({
        durationSeconds: 37,
        outcome: 'completed',
      }),
    });
    expect(usage.finalizeVoiceCall).toHaveBeenCalledWith({
      workspaceId: context.workspaceId,
      callId: 'call_123',
      durationSeconds: 37,
    });
    expect(events.create).not.toHaveBeenCalled();
  });

  it('settles a final Twilio callback status even when the call was still queued locally', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'queued',
            durationSeconds: 0,
            outcome: 'response_captured',
            endedAt: null,
          }),
        ),
        update: jest.fn().mockResolvedValue(
          callFixture({
            provider: 'twilio',
            providerCallId: 'CA123',
            status: 'completed',
            durationSeconds: 12,
            outcome: 'response_captured',
          }),
        ),
      },
      providerRawEvent: {
        create: jest.fn().mockResolvedValue({ id: 'prevt_123' }),
      },
    } as unknown as PrismaService;
    const { service, events, usage } = createService(prisma);

    await service.receiveProviderCallStatus({
      provider: 'twilio',
      providerCallId: 'CA123',
      status: 'completed',
      durationSeconds: 12,
      rawPayload: { CallSid: 'CA123', CallStatus: 'completed', CallDuration: '12' },
    });

    expect(prisma.call.update).toHaveBeenCalledWith({
      where: { id: 'call_123' },
      data: expect.objectContaining({
        status: 'completed',
        durationSeconds: 12,
        endedAt: expect.any(Date),
      }),
    });
    expect(usage.finalizeVoiceCall).toHaveBeenCalledWith({
      workspaceId: context.workspaceId,
      callId: 'call_123',
      durationSeconds: 12,
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.completed',
      }),
    );
  });
});
