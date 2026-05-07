import { Decimal } from '@prisma/client/runtime/library';

import type { BillingService } from '../billing/billing.service';
import type { PrismaService } from '../prisma/prisma.service';
import { UsageService } from './usage.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

const now = new Date('2026-05-07T00:00:00.000Z');

function usageFixture(overrides = {}) {
  return {
    id: 'use_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    resourceType: 'message',
    resourceId: 'msg_123',
    channel: 'sms.outbound',
    quantity: new Decimal(1),
    unit: 'message',
    unitCost: new Decimal('0.0100'),
    totalCost: new Decimal('0.0100'),
    occurredAt: now,
    createdAt: now,
    ...overrides,
  };
}

function createService(prisma: PrismaService) {
  const billing = {
    debitWorkspace: jest.fn().mockResolvedValue({ id: 'bal_123' }),
    creditWorkspace: jest.fn().mockResolvedValue({ id: 'bal_123' }),
  } as unknown as BillingService;

  return {
    service: new UsageService(prisma, billing),
    billing,
  };
}

describe('UsageService', () => {
  it('records outbound SMS usage and debits balance', async () => {
    const prisma = {
      usageEvent: {
        create: jest.fn().mockResolvedValue(usageFixture()),
      },
    } as unknown as PrismaService;
    const { service, billing } = createService(prisma);

    await service.recordSms({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      agentId: 'agt_123',
      messageId: 'msg_123',
      direction: 'outbound',
    });

    expect(billing.debitWorkspace).toHaveBeenCalledWith(context.workspaceId, 1);
    expect(prisma.usageEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'sms.outbound',
        quantity: new Decimal(1),
        unitCost: new Decimal('0.0100'),
        totalCost: new Decimal('0.0100'),
      }),
    });
  });

  it('rolls usage up by day', async () => {
    const prisma = {
      usageEvent: {
        findMany: jest.fn().mockResolvedValue([
          usageFixture(),
          usageFixture({
            id: 'use_456',
            totalCost: new Decimal('0.0300'),
            quantity: new Decimal(2),
          }),
        ]),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.getDailyUsage(context, {});

    expect(result.data).toEqual([
      {
        period: '2026-05-07',
        quantity: '3',
        totalCost: '0.04',
      },
    ]);
  });

  it('finalizes voice usage and refunds unused preauthorization', async () => {
    const prisma = {
      usageEvent: {
        findFirst: jest.fn().mockResolvedValue(
          usageFixture({
            resourceType: 'call',
            resourceId: 'call_123',
            channel: 'voice',
            quantity: new Decimal(10),
            unitCost: new Decimal('0.0300'),
            totalCost: new Decimal('0.3000'),
          }),
        ),
        update: jest.fn().mockResolvedValue(usageFixture()),
      },
    } as unknown as PrismaService;
    const { service, billing } = createService(prisma);

    const result = await service.finalizeVoiceCall({
      workspaceId: context.workspaceId,
      callId: 'call_123',
      durationSeconds: 64,
    });

    expect(result).toEqual({ finalized: true, deltaCents: -24 });
    expect(billing.creditWorkspace).toHaveBeenCalledWith(context.workspaceId, 24);
    expect(prisma.usageEvent.update).toHaveBeenCalledWith({
      where: { id: 'use_123' },
      data: expect.objectContaining({
        quantity: new Decimal(2),
        totalCost: new Decimal('0.0600'),
      }),
    });
  });
});
