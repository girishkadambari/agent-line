import { ProviderEventsService } from './provider-events.service';

describe('ProviderEventsService', () => {
  const context = {
    workspaceId: 'ws_123',
    projectId: 'proj_123',
    authType: 'api_key' as const,
    apiKeyId: 'key_123',
  };

  function createService(overrides = {}) {
    const prisma = {
      providerRawEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      call: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ...overrides,
    };

    return {
      service: new ProviderEventsService(prisma as never),
      prisma,
    };
  }

  it('lists provider callback events with linked call resources', async () => {
    const createdAt = new Date('2026-05-19T00:00:00.000Z');
    const { service, prisma } = createService({
      providerRawEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'prevt_123',
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            provider: 'twilio',
            eventType: 'twilio.voice.status',
            providerEventId: 'CA123:status:completed',
            payload: { CallStatus: 'completed' },
            createdAt,
          },
        ]),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      call: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'call_123',
            providerCallId: 'CA123',
            status: 'completed',
            agentId: 'agt_123',
          },
        ]),
      },
    });

    const result = await service.listProviderEvents(context, 10, {});

    expect(prisma.call.findMany).toHaveBeenCalledWith({
      where: {
        providerCallId: { in: ['CA123'] },
      },
    });
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'prevt_123',
        eventType: 'twilio.voice.status',
        status: 'completed',
        resource: {
          type: 'call',
          id: 'call_123',
          status: 'completed',
          agentId: 'agt_123',
        },
        receivedAt: createdAt.toISOString(),
      }),
    ]);
  });

  it('summarizes provider events and recent errors', async () => {
    const createdAt = new Date('2026-05-19T00:00:00.000Z');
    const { service } = createService({
      providerRawEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'prevt_failed',
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            provider: 'twilio',
            eventType: 'twilio.sms.status',
            providerEventId: 'SM123:failed',
            payload: { MessageStatus: 'failed', ErrorCode: '30007' },
            createdAt,
          },
        ]),
        count: jest.fn().mockResolvedValue(2),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ eventType: 'twilio.sms.status', _count: { _all: 2 } }]),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'msg_123',
            providerMessageId: 'SM123',
            status: 'failed',
            agentId: 'agt_123',
          },
        ]),
      },
      call: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result = await service.getProviderEventSummary(context);

    expect(result).toEqual({
      total: 2,
      byEventType: {
        'twilio.sms.status': 2,
      },
      recentErrors: [
        expect.objectContaining({
          id: 'prevt_failed',
          errorCode: '30007',
          resource: {
            type: 'message',
            id: 'msg_123',
            status: 'failed',
            agentId: 'agt_123',
          },
        }),
      ],
    });
  });
});
