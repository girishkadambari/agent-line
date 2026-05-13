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
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

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

  it('delivers matching active endpoint events immediately', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const prisma = {
      webhookEndpoint: {
        findMany: jest.fn().mockResolvedValue([endpointFixture()]),
      },
      webhookDelivery: {
        create: jest.fn().mockResolvedValue(deliveryFixture({ status: 'pending' })),
        update: jest.fn().mockResolvedValue(
          deliveryFixture({
            status: 'succeeded',
            attemptCount: 1,
            lastStatusCode: 204,
            lastError: null,
            nextAttemptAt: null,
          }),
        ),
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
    expect(result[0].status).toBe('succeeded');
    expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'active',
        events: { has: 'agent.message.sent' },
      }),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/webhooks',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'agentline-signature': expect.stringMatching(/^v1=/),
          'agentline-timestamp': expect.any(String),
        }),
      }),
    );
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'whdel_123' },
      data: expect.objectContaining({
        status: 'succeeded',
        attemptCount: 1,
        lastStatusCode: 204,
        lastError: null,
      }),
    });
  });

  it('marks real webhook delivery failed when endpoint returns an error', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const prisma = {
      webhookEndpoint: {
        findMany: jest.fn().mockResolvedValue([endpointFixture()]),
      },
      webhookDelivery: {
        create: jest.fn().mockResolvedValue(deliveryFixture({ status: 'pending' })),
        update: jest.fn().mockResolvedValue(
          deliveryFixture({
            status: 'failed',
            attemptCount: 1,
            lastStatusCode: 500,
            lastError: 'Webhook endpoint returned HTTP 500.',
          }),
        ),
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

    expect(result[0].status).toBe('failed');
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'whdel_123' },
      data: expect.objectContaining({
        status: 'failed',
        attemptCount: 1,
        lastStatusCode: 500,
        lastError: 'Webhook endpoint returned HTTP 500.',
        nextAttemptAt: expect.any(Date),
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
