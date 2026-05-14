import { Decimal } from '@prisma/client/runtime/library';

import type { BillingService } from '../billing/billing.service';
import type { EventsService } from '../events/events.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { WebhooksService } from '../webhooks/webhooks.service';
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
    billableQuantity: new Decimal(1),
    unit: 'message',
    unitCost: new Decimal('0.0100'),
    totalCost: new Decimal('0.0100'),
    pricingVersion: '2026-05-14',
    calculation: {},
    evidence: {},
    settlementStatus: 'internal_debited',
    stripeMeterEventId: null,
    occurredAt: now,
    createdAt: now,
    ...overrides,
  };
}

function createService(prisma: PrismaService) {
  const billing = {
    debitWorkspace: jest.fn().mockResolvedValue({ id: 'bal_123' }),
    creditWorkspace: jest.fn().mockResolvedValue({ id: 'bal_123' }),
    reportUsageEventToStripe: jest.fn().mockResolvedValue({ status: 'internal_debited' }),
  } as unknown as BillingService;
  const events = {
    create: jest.fn().mockResolvedValue({
      id: 'evt_123',
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: 'agent.usage.recorded',
      resourceType: 'usage_event',
      resourceId: 'use_123',
      payload: {},
      createdAt: now.toISOString(),
    }),
  } as unknown as EventsService;
  const webhooks = {
    createDeliveriesForEvent: jest.fn().mockResolvedValue([]),
  } as unknown as WebhooksService;

  return {
    service: new UsageService(prisma, billing, events, webhooks),
    billing,
    events,
    webhooks,
  };
}

describe('UsageService', () => {
  it('records outbound SMS usage and debits balance', async () => {
    const prisma = {
      usageEvent: {
        create: jest.fn().mockResolvedValue(usageFixture()),
      },
    } as unknown as PrismaService;
    const { service, billing, events, webhooks } = createService(prisma);

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
        billableQuantity: new Decimal(1),
        unitCost: new Decimal('0.0100'),
        totalCost: new Decimal('0.0100'),
        pricingVersion: '2026-05-14',
        calculation: expect.objectContaining({
          formula: 'ceil(quantity * unitCostCents)',
          totalCents: 1,
        }),
        evidence: expect.objectContaining({
          source: 'sms.outbound',
          messageId: 'msg_123',
        }),
      }),
    });
    expect(billing.reportUsageEventToStripe).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'use_123' }),
    );
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.usage.recorded',
        resourceType: 'usage_event',
        resourceId: 'use_123',
      }),
    );
    expect(webhooks.createDeliveriesForEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent.usage.recorded' }),
    );
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
            billableQuantity: new Decimal(10),
            unitCost: new Decimal('0.0300'),
            totalCost: new Decimal('0.3000'),
          }),
        ),
        update: jest.fn().mockResolvedValue(usageFixture()),
      },
    } as unknown as PrismaService;
    const { service, billing, events } = createService(prisma);

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
        billableQuantity: new Decimal(2),
        totalCost: new Decimal('0.0600'),
        calculation: expect.objectContaining({
          durationSeconds: 64,
          settlementDeltaCents: -24,
        }),
      }),
    });
    expect(billing.reportUsageEventToStripe).toHaveBeenCalled();
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent.usage.finalized' }),
    );
  });
});
