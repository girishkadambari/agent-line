import type { PrismaService } from '../prisma/prisma.service';
import type { EventsService } from '../events/events.service';
import { WebhooksService } from './webhooks.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

const now = new Date('2026-05-07T00:00:00.000Z');

function endpointFixture(overrides = {}) {
  return {
    id: 'wh_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    url: 'https://example.com/webhooks',
    secret: 'whsec_test',
    events: ['agent.message.sent'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function deliveryFixture(overrides = {}) {
  return {
    id: 'whdel_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    endpointId: 'wh_123',
    eventId: 'evt_123',
    eventType: 'webhook.test',
    payload: { id: 'evt_123' },
    status: 'failed',
    attemptCount: 1,
    lastStatusCode: 500,
    lastError: 'Mock webhook delivery failed.',
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createService(prisma: PrismaService) {
  const events = {
    create: jest.fn().mockResolvedValue({
      id: 'evt_123',
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: 'webhook.test',
      payload: { endpointId: 'wh_123' },
    }),
  } as unknown as EventsService;

  return {
    service: new WebhooksService(prisma, events),
    events,
  };
}

describe('WebhooksService', () => {
  it('creates webhook endpoint and returns secret once', async () => {
    const prisma = {
      webhookEndpoint: {
        create: jest.fn().mockResolvedValue(endpointFixture()),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.createEndpoint(context, {
      url: 'https://example.com/webhooks',
      events: ['agent.message.sent'],
    });

    expect(result.secret).toBe('whsec_test');
    expect(prisma.webhookEndpoint.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        url: 'https://example.com/webhooks',
        events: ['agent.message.sent'],
        status: 'active',
      }),
    });
  });

  it('creates signed failed test delivery with retry time', async () => {
    const prisma = {
      webhookEndpoint: {
        findFirst: jest.fn().mockResolvedValue(endpointFixture()),
      },
      webhookDelivery: {
        create: jest.fn().mockResolvedValue(deliveryFixture()),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.createTestDelivery(context, 'wh_123', {
      simulateFailure: true,
    });

    expect(result.delivery.status).toBe('failed');
    expect(result.headers['agentline-signature']).toMatch(/^v1=/);
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failed',
        attemptCount: 1,
        lastStatusCode: 500,
      }),
    });
  });

  it('creates pending deliveries for matching active endpoints only', async () => {
    const prisma = {
      webhookEndpoint: {
        findMany: jest.fn().mockResolvedValue([endpointFixture()]),
      },
      webhookDelivery: {
        create: jest.fn().mockResolvedValue(deliveryFixture({ status: 'pending' })),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.createDeliveriesForEvent({
      id: 'evt_123',
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: 'agent.message.sent',
      payload: { messageId: 'msg_123' },
    });

    expect(result).toHaveLength(1);
    expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'active',
        events: { has: 'agent.message.sent' },
      }),
    });
  });

  it('retries failed delivery and marks it succeeded', async () => {
    const prisma = {
      webhookDelivery: {
        findFirst: jest.fn().mockResolvedValue(deliveryFixture()),
        update: jest.fn().mockResolvedValue(
          deliveryFixture({
            status: 'succeeded',
            attemptCount: 2,
            lastStatusCode: 200,
            lastError: null,
            nextAttemptAt: null,
          }),
        ),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.retryDelivery(context, 'whdel_123', {
      outcome: 'succeeded',
      exhaust: false,
    });

    expect(result.status).toBe('succeeded');
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'whdel_123' },
      data: expect.objectContaining({
        status: 'succeeded',
        attemptCount: 2,
      }),
    });
  });
});
