import type { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

const now = new Date('2026-05-07T00:00:00.000Z');

function balanceFixture(overrides = {}) {
  return {
    id: 'bal_123',
    workspaceId: 'ws_123',
    currency: 'USD',
    balanceCents: 500,
    spendLimitCents: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('BillingService', () => {
  it('debits workspace balance', async () => {
    const prisma = {
      billingBalance: {
        findUnique: jest.fn().mockResolvedValue(balanceFixture()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(balanceFixture({ balanceCents: 475 })),
      },
      usageEvent: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalCost: null } }),
      },
    } as unknown as PrismaService;
    const service = new BillingService(prisma);

    const result = await service.debitWorkspace('ws_123', 25);

    expect(result.balanceCents).toBe(475);
    expect(prisma.billingBalance.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws_123',
        balanceCents: { gte: 25 },
      },
      data: {
        balanceCents: { decrement: 25 },
      },
    });
  });

  it('throws insufficient balance when debit is too high', async () => {
    const prisma = {
      billingBalance: {
        findUnique: jest.fn().mockResolvedValue(balanceFixture({ balanceCents: 5 })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      usageEvent: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalCost: null } }),
      },
    } as unknown as PrismaService;
    const service = new BillingService(prisma);

    await expect(service.debitWorkspace('ws_123', 25)).rejects.toMatchObject({
      code: 'insufficient_balance',
    });
  });

  it('checks spend limit against cumulative workspace usage', async () => {
    const prisma = {
      billingBalance: {
        findUnique: jest
          .fn()
          .mockResolvedValue(balanceFixture({ balanceCents: 500, spendLimitCents: 100 })),
      },
      usageEvent: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalCost: { toNumber: () => 0.9 } } }),
      },
    } as unknown as PrismaService;
    const service = new BillingService(prisma);

    await expect(service.debitWorkspace('ws_123', 25)).rejects.toMatchObject({
      code: 'insufficient_balance',
    });
  });
});
