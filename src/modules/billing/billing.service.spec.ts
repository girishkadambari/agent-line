import type { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import type { StripeClientService } from './stripe-client.service';

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
  function createService(prisma: PrismaService, stripeOverrides = {}) {
    const stripe = {
      createCustomer: jest.fn().mockResolvedValue({ id: 'cus_123' }),
      createCheckoutSession: jest.fn().mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/c/pay/cs_123',
        customer: 'cus_123',
      }),
      createPortalSession: jest.fn().mockResolvedValue({
        id: 'bps_123',
        url: 'https://billing.stripe.com/session/bps_123',
        customer: 'cus_123',
      }),
      constructWebhookEvent: jest.fn(),
      ...stripeOverrides,
    } as unknown as StripeClientService;

    return {
      service: new BillingService(prisma, stripe),
      stripe,
    };
  }

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
    const { service } = createService(prisma);

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
    const { service } = createService(prisma);

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
    const { service } = createService(prisma);

    await expect(service.debitWorkspace('ws_123', 25)).rejects.toMatchObject({
      code: 'insufficient_balance',
    });
  });

  it('creates Stripe checkout session and pending transaction', async () => {
    const prisma = {
      billingAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'bacc_123',
          workspaceId: 'ws_123',
          provider: 'stripe',
          providerCustomerId: 'cus_123',
          status: 'active',
          defaultCurrency: 'USD',
          createdAt: now,
          updatedAt: now,
        }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ name: 'AgentLine Local' }),
      },
      billingTransaction: {
        create: jest.fn().mockResolvedValue({
          id: 'btxn_123',
          workspaceId: 'ws_123',
          provider: 'stripe',
          providerEventId: null,
          type: 'checkout_session.created',
          amountCents: 2000,
          currency: 'USD',
          status: 'pending',
          metadata: { checkoutSessionId: 'cs_123' },
          createdAt: now,
        }),
      },
    } as unknown as PrismaService;
    const { service, stripe } = createService(prisma);

    const result = await service.createCheckoutSession(
      { workspaceId: 'ws_123', projectId: 'proj_123', apiKeyId: 'key_123' },
      {
        amountCents: 2000,
        successUrl: 'https://app.agentline.dev/success',
        cancelUrl: 'https://app.agentline.dev/cancel',
      },
    );

    expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_123');
    expect(stripe.createCustomer).toHaveBeenCalledWith({
      workspaceId: 'ws_123',
      name: 'AgentLine Local',
    });
    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_123',
        customerId: 'cus_123',
        amountCents: 2000,
      }),
    );
  });

  it('credits balance from verified checkout completed webhook once', async () => {
    const prisma = {
      billingTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'btxn_123',
          workspaceId: 'ws_123',
          provider: 'stripe',
          providerEventId: 'evt_123',
          type: 'checkout.session.completed',
          amountCents: 2000,
          currency: 'USD',
          status: 'succeeded',
          metadata: {},
          createdAt: now,
        }),
      },
      billingBalance: {
        findUnique: jest.fn().mockResolvedValue(balanceFixture()),
        update: jest.fn().mockResolvedValue(balanceFixture({ balanceCents: 2500 })),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma, {
      constructWebhookEvent: jest.fn().mockReturnValue({
        id: 'evt_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            amount_total: 2000,
            currency: 'usd',
            metadata: { workspaceId: 'ws_123', amountCents: '2000' },
          },
        },
      }),
    });

    const result = await service.handleStripeWebhook(Buffer.from('{}'), 't=1,v1=test');

    expect(result).toEqual({ received: true, duplicate: false });
    expect(prisma.billingBalance.update).toHaveBeenCalledWith({
      where: { workspaceId: 'ws_123' },
      data: { balanceCents: { increment: 2000 } },
    });
    expect(prisma.billingTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerEventId: 'evt_123',
        status: 'succeeded',
        amountCents: 2000,
      }),
    });
  });
});
