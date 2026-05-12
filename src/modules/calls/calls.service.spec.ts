import type { PrismaService } from '../prisma/prisma.service';
import type { ContactsService } from '../contacts/contacts.service';
import type { ConversationsService } from '../conversations/conversations.service';
import type { EventsService } from '../events/events.service';
import { MockProviderService } from '../providers/mock/mock-provider.service';
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

function createService(prisma: PrismaService) {
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
  const provider = new MockProviderService();

  return {
    service: new CallsService(prisma, contacts, conversations, events, provider, usage, webhooks),
    contacts,
    conversations,
    events,
    usage,
    webhooks,
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
    const { service, events, usage } = createService(prisma);

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
    const { service, events } = createService(prisma);

    const result = await service.transferCall(context, 'call_123', { to: '+14155550200' });

    expect(result.status).toBe('transferred');
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.transferred',
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
        findFirst: jest.fn().mockResolvedValue(callFixture({ provider: 'twilio', providerCallId: 'CA123' })),
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
  });

  it('records live Twilio speech as a transcript turn and emits an update event', async () => {
    const prisma = {
      call: {
        findFirst: jest.fn().mockResolvedValue(callFixture({ provider: 'twilio', providerCallId: 'CA123' })),
        update: jest.fn().mockResolvedValue(callFixture({ summary: 'Caller said: Hello AgentLine' })),
      },
      transcriptTurn: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(transcriptTurnFixture({ endedAtMs: 5000 })),
        create: jest.fn().mockResolvedValue(transcriptTurnFixture({ speaker: 'user', text: 'Hello AgentLine' })),
      },
    } as unknown as PrismaService;
    const { service, events } = createService(prisma);

    await service.receiveProviderVoiceSpeech({
      provider: 'twilio',
      providerCallId: 'CA123',
      speechResult: 'Hello AgentLine',
      confidence: 0.92,
    });

    expect(prisma.transcriptTurn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callId: 'call_123',
        speaker: 'user',
        text: 'Hello AgentLine',
        confidence: 0.92,
      }),
    });
    expect(prisma.call.update).toHaveBeenCalledWith({
      where: { id: 'call_123' },
      data: expect.objectContaining({
        summary: 'Caller said: Hello AgentLine',
      }),
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.call.transcript_updated',
      }),
    );
  });
});
