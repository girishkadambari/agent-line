import { createAgentSchema } from '../../domain/schemas';
import { Decimal } from '@prisma/client/runtime/library';
import type { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from './agents.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

const now = new Date('2026-05-06T00:00:00.000Z');

function agentFixture(overrides = {}) {
  return {
    id: 'agt_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    name: 'Support Agent',
    description: null,
    mode: 'webhook',
    status: 'active',
    systemPrompt: null,
    voice: null,
    beginMessage: null,
    transferNumber: null,
    voicemailMessage: null,
    webhookUrl: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function numberFixture(overrides = {}) {
  return {
    id: 'num_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    phoneNumber: '+19012316325',
    country: 'US',
    areaCode: '901',
    capabilities: ['sms', 'voice'],
    status: 'active',
    provider: 'twilio',
    providerNumberId: 'PN123',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function conversationFixture(overrides = {}) {
  return {
    id: 'conv_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    contactId: 'ctc_123',
    channel: 'sms',
    status: 'active',
    lastActivityAt: now,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

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
    fromNumber: '+19012316325',
    toNumber: '+917799027234',
    status: 'completed',
    durationSeconds: 12,
    summary: 'Caller responded.',
    outcome: 'response_captured',
    recordingId: null,
    provider: 'twilio',
    providerCallId: 'CA123',
    startedAt: now,
    endedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function messageFixture(overrides = {}) {
  return {
    id: 'msg_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    conversationId: 'conv_123',
    phoneNumberId: 'num_123',
    contactId: 'ctc_123',
    direction: 'inbound',
    body: 'Hello',
    status: 'received',
    provider: 'twilio',
    providerMessageId: 'SM123',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function usageEventFixture(overrides = {}) {
  return {
    id: 'use_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    resourceType: 'call',
    resourceId: 'call_123',
    channel: 'voice',
    quantity: new Decimal(1),
    unit: 'minute',
    unitCost: new Decimal('0.0300'),
    totalCost: new Decimal('0.0300'),
    occurredAt: now,
    createdAt: now,
    ...overrides,
  };
}

function webhookDeliveryFixture(overrides = {}) {
  return {
    id: 'whdel_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    endpointId: 'wh_123',
    eventId: 'evt_123',
    eventType: 'agent.call.transcript_updated',
    payload: { data: { agentId: 'agt_123' } },
    status: 'succeeded',
    attemptCount: 1,
    lastStatusCode: 200,
    lastError: null,
    nextAttemptAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function providerRawEventFixture(overrides = {}) {
  return {
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
    ...overrides,
  };
}

describe('AgentsService', () => {
  function createService(prisma: PrismaService) {
    const events = {
      create: jest.fn().mockResolvedValue({ id: 'evt_123' }),
    };
    const webhooks = {
      createDeliveriesForEvent: jest.fn().mockResolvedValue([]),
    };

    return {
      service: new AgentsService(prisma, events as never, webhooks as never),
      events,
      webhooks,
    };
  }

  it('creates an agent scoped to the request context', async () => {
    const prisma = {
      agent: {
        create: jest.fn().mockResolvedValue(agentFixture()),
      },
    } as unknown as PrismaService;
    const { service, events } = createService(prisma);

    const result = await service.createAgent(context, {
      name: 'Support Agent',
      mode: 'webhook',
      metadata: {},
    });

    expect(prisma.agent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        name: 'Support Agent',
        mode: 'webhook',
      }),
    });
    expect(result.id).toBe('agt_123');
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.created',
        resourceType: 'agent',
      }),
    );
  });

  it('lists agents with documented pagination shape', async () => {
    const prisma = {
      agent: {
        findMany: jest.fn().mockResolvedValue([agentFixture()]),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    await expect(service.listAgents(context, 10)).resolves.toMatchObject({
      data: [{ id: 'agt_123' }],
      pagination: { limit: 10, nextCursor: null },
    });
  });

  it('disables an agent instead of deleting history', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue(agentFixture()),
        update: jest.fn().mockResolvedValue(agentFixture({ status: 'disabled' })),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.disableAgent(context, 'agt_123');

    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'agt_123' },
      data: { status: 'disabled' },
    });
    expect(result.status).toBe('disabled');
  });

  it('rejects invalid agent mode at validation boundary', () => {
    expect(() =>
      createAgentSchema.parse({
        name: 'Bad Agent',
        mode: 'invalid',
      }),
    ).toThrow();
  });

  it('returns an agent operating summary with real scoped activity', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue(agentFixture()),
      },
      phoneNumber: {
        findMany: jest.fn().mockResolvedValue([numberFixture()]),
      },
      conversation: {
        findMany: jest.fn().mockResolvedValue([conversationFixture()]),
      },
      call: {
        findMany: jest.fn().mockResolvedValue([callFixture()]),
      },
      message: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([messageFixture()]),
      },
      usageEvent: {
        findMany: jest.fn().mockResolvedValue([usageEventFixture()]),
      },
      webhookDelivery: {
        findMany: jest.fn().mockResolvedValue([webhookDeliveryFixture()]),
      },
      providerRawEvent: {
        findMany: jest.fn().mockResolvedValue([providerRawEventFixture()]),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.getAgentSummary(context, 'agt_123');

    expect(result.agent.id).toBe('agt_123');
    expect(result.counts).toMatchObject({
      numbers: 1,
      activeNumbers: 1,
      conversations: 1,
      messages: 2,
      calls: 1,
      failedWebhookDeliveries: 0,
      providerIssues: 1,
    });
    expect(result.numbers[0].phoneNumber).toBe('+19012316325');
    expect(result.recentCalls[0].id).toBe('call_123');
    expect(result.recentMessages[0].body).toBe('Hello');
    expect(result.recentWebhookDeliveries[0].eventType).toBe('agent.call.transcript_updated');
    expect(result.providerIssues[0]).toMatchObject({
      code: '13224',
      message: 'Call could not be completed.',
      resourceId: 'call_123',
      resourceType: 'call',
    });
    expect(result.timeline.map((item) => item.type)).toEqual(
      expect.arrayContaining(['call', 'message', 'usage', 'webhook', 'provider_issue']),
    );
    expect(result.usage.totalCost).toBe('0.03');
    expect(result.lastActivityAt).toBe(now.toISOString());
  });
});
