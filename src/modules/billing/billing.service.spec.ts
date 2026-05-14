import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { UsageSettlementMode, UsageSettlementStatus, type UsageEvent } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
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
      createSubscriptionCheckoutSession: jest.fn().mockResolvedValue({
        id: 'cs_sub_123',
        url: 'https://checkout.stripe.com/c/pay/cs_sub_123',
        customer: 'cus_123',
        subscription: 'sub_123',
      }),
      createPortalSession: jest.fn().mockResolvedValue({
        id: 'bps_123',
        url: 'https://billing.stripe.com/session/bps_123',
        customer: 'cus_123',
      }),
      constructWebhookEvent: jest.fn(),
      isUsageMeteringConfigured: jest.fn().mockReturnValue(false),
      createUsageMeterEvent: jest.fn().mockResolvedValue({
        identifier: 'use_123',
        event_name: 'agentline_usage',
      }),
      getConfigurationStatus: jest.fn().mockReturnValue({
        mode: 'test',
        secretKeyConfigured: true,
        secretKeyMatchesMode: true,
        webhookSecretConfigured: true,
        webhookToleranceSeconds: 300,
        usageMeterEventNameConfigured: false,
      }),
      getMode: jest.fn().mockReturnValue('test'),
      ...stripeOverrides,
    } as unknown as StripeClientService;
    const audit = {
      record: jest.fn().mockResolvedValue({}),
    } as unknown as AuditService;

    return {
      service: new BillingService(prisma, stripe, audit),
      stripe,
      audit,
    };
  }

  function usageEventFixture(overrides: Partial<UsageEvent> = {}): UsageEvent {
    return {
      id: 'use_123',
      workspaceId: 'ws_123',
      projectId: 'proj_123',
      agentId: 'agt_123',
      resourceType: 'call',
      resourceId: 'call_123',
      channel: 'voice',
      quantity: new Decimal(2),
      billableQuantity: new Decimal(2),
      unit: 'minute',
      unitCost: new Decimal('0.0300'),
      totalCost: new Decimal('0.0600'),
      pricingVersion: '2026-05-14',
      calculation: {},
      evidence: {},
      settlementMode: UsageSettlementMode.prepaid_balance,
      allowanceGrantId: null,
      settlementStatus: UsageSettlementStatus.internal_debited,
      stripeMeterEventId: null,
      occurredAt: now,
      createdAt: now,
      ...overrides,
    };
  }

  function withTransaction(prisma: Record<string, unknown>) {
    return {
      ...prisma,
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    } as unknown as PrismaService;
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

  it('settles usage against active trial allowance before prepaid balance', async () => {
    const prisma = {
      billingAllowanceGrant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'balg_trial',
            workspaceId: 'ws_123',
            subscriptionId: null,
            source: 'trial',
            amountCents: 500,
            consumedCents: 125,
            currency: 'USD',
            periodStart: now,
            periodEnd: new Date('2026-05-21T00:00:00.000Z'),
            expiresAt: new Date('2026-05-21T00:00:00.000Z'),
            metadata: {},
            createdAt: now,
            updatedAt: now,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      billingSubscription: {
        findFirst: jest.fn(),
      },
      billingBalance: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.settleUsageCharge({
      workspaceId: 'ws_123',
      cents: 50,
      occurredAt: now,
    });

    expect(result).toMatchObject({
      settlementMode: UsageSettlementMode.trial_allowance,
      settlementStatus: 'internal_debited',
      allowanceGrantId: 'balg_trial',
    });
    expect(prisma.billingAllowanceGrant.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'balg_trial',
        consumedCents: { lte: 450 },
      },
      data: { consumedCents: { increment: 50 } },
    });
    expect(prisma.billingBalance.updateMany).not.toHaveBeenCalled();
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
    expect(result.mode).toBe('test');
  });

  it('creates Stripe subscription checkout session for configured paid plan', async () => {
    const prisma = {
      billingAccount: {
        findUnique: jest.fn().mockResolvedValue({
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
      billingTransaction: {
        create: jest.fn().mockResolvedValue({
          id: 'btxn_123',
          workspaceId: 'ws_123',
          provider: 'stripe',
          providerEventId: null,
          type: 'subscription_checkout_session.created',
          amountCents: 2900,
          currency: 'USD',
          status: 'pending',
          metadata: { checkoutSessionId: 'cs_sub_123' },
          createdAt: now,
        }),
      },
    } as unknown as PrismaService;
    const { service, stripe } = createService(prisma);
    const previous = process.env.STRIPE_STARTER_PRICE_ID;
    process.env.STRIPE_STARTER_PRICE_ID = 'price_starter';

    try {
      const result = await service.createSubscriptionCheckoutSession(
        { workspaceId: 'ws_123', projectId: 'proj_123', apiKeyId: 'key_123' },
        {
          planKey: 'starter',
          successUrl: 'https://app.agentline.dev/billing?subscription=success',
          cancelUrl: 'https://app.agentline.dev/billing?subscription=cancelled',
        },
      );

      expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_sub_123');
      expect(stripe.createSubscriptionCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws_123',
          customerId: 'cus_123',
          planKey: 'starter',
          priceId: 'price_starter',
          trialDays: 14,
        }),
      );
      expect(prisma.billingTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'subscription_checkout_session.created',
          amountCents: 2900,
        }),
      });
    } finally {
      if (previous === undefined) {
        delete process.env.STRIPE_STARTER_PRICE_ID;
      } else {
        process.env.STRIPE_STARTER_PRICE_ID = previous;
      }
    }
  });

  it('backfills signup billing state when subscription summary is loaded', async () => {
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
      billingAllowanceGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      billingSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.getSubscription({
      workspaceId: 'ws_123',
      projectId: 'proj_123',
      apiKeyId: 'key_123',
    });

    expect(result.billingAccount.providerCustomerId).toBe('cus_123');
    expect(prisma.billingAllowanceGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws_123',
        source: 'trial',
        amountCents: 500,
      }),
    });
  });

  it('returns Stripe configuration status without exposing secrets', () => {
    const prisma = {} as unknown as PrismaService;
    const { service } = createService(prisma);

    expect(service.getStripeStatus()).toEqual({
      mode: 'test',
      secretKeyConfigured: true,
      secretKeyMatchesMode: true,
      webhookSecretConfigured: true,
      webhookToleranceSeconds: 300,
      usageMeterEventNameConfigured: false,
    });
  });

  it('keeps usage internally debited when Stripe metering is not configured', async () => {
    const prisma = {
      billingAccount: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    const { service, stripe } = createService(prisma);

    await expect(service.reportUsageEventToStripe(usageEventFixture())).resolves.toEqual({
      status: 'internal_debited',
    });
    expect(stripe.createUsageMeterEvent).not.toHaveBeenCalled();
    expect(prisma.billingAccount.findUnique).not.toHaveBeenCalled();
  });

  it('reports usage evidence to Stripe meter events when a billing customer exists', async () => {
    const prisma = {
      billingAccount: {
        findUnique: jest.fn().mockResolvedValue({
          workspaceId: 'ws_123',
          provider: 'stripe',
          providerCustomerId: 'cus_123',
        }),
      },
    } as unknown as PrismaService;
    const { service, stripe } = createService(prisma, {
      isUsageMeteringConfigured: jest.fn().mockReturnValue(true),
    });

    await expect(service.reportUsageEventToStripe(usageEventFixture())).resolves.toEqual({
      status: 'stripe_reported',
      stripeMeterEventId: 'use_123',
    });
    expect(stripe.createUsageMeterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'use_123',
        customerId: 'cus_123',
        value: 6,
        usageEventId: 'use_123',
        resourceType: 'call',
        resourceId: 'call_123',
        channel: 'voice',
      }),
    );
  });

  it('does not report already settled usage to Stripe again', async () => {
    const prisma = {
      billingAccount: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    const { service, stripe } = createService(prisma, {
      isUsageMeteringConfigured: jest.fn().mockReturnValue(true),
    });

    await expect(
      service.reportUsageEventToStripe(
        usageEventFixture({
          settlementStatus: UsageSettlementStatus.stripe_reported,
          stripeMeterEventId: 'meter_evt_123',
        }),
      ),
    ).resolves.toEqual({
      status: 'stripe_reported',
      stripeMeterEventId: 'meter_evt_123',
    });
    expect(stripe.createUsageMeterEvent).not.toHaveBeenCalled();
  });

  it('returns pricing rules for cost calculation', () => {
    const prisma = {} as unknown as PrismaService;
    const { service } = createService(prisma);

    expect(service.getPricing()).toEqual(
      expect.objectContaining({
        currency: 'USD',
        rates: expect.arrayContaining([
          expect.objectContaining({
            key: 'voice_minute',
            unitCostCents: 3,
            formula: 'ceil(duration_seconds / 60) * voice_minute',
          }),
        ]),
      }),
    );
  });

  it('updates workspace billing controls', async () => {
    const prisma = {
      billingBalance: {
        findUnique: jest.fn().mockResolvedValue(balanceFixture()),
        update: jest.fn().mockResolvedValue(balanceFixture({ spendLimitCents: 2500 })),
      },
    } as unknown as PrismaService;
    const { service, audit } = createService(prisma);

    const result = await service.updateControls(
      { workspaceId: 'ws_123', projectId: 'proj_123', apiKeyId: 'key_123' },
      { spendLimitCents: 2500 },
    );

    expect(result.controls.spendLimitCents).toBe(2500);
    expect(prisma.billingBalance.update).toHaveBeenCalledWith({
      where: { workspaceId: 'ws_123' },
      data: { spendLimitCents: 2500 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_123',
        action: 'billing.controls_updated',
        metadata: {
          previousSpendLimitCents: null,
          spendLimitCents: 2500,
        },
      }),
    );
  });

  it('returns cost summary with clear channel and agent breakdowns', async () => {
    const prisma = {
      billingBalance: {
        findUnique: jest
          .fn()
          .mockResolvedValue(balanceFixture({ balanceCents: 1000, spendLimitCents: 5000 })),
      },
      usageEvent: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 2 },
          _sum: {
            quantity: { toString: () => '3' },
            totalCost: { toString: () => '0.07', toNumber: () => 0.07 },
          },
        }),
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([
            {
              channel: 'voice',
              unit: 'minute',
              unitCost: { toString: () => '0.0300', toNumber: () => 0.03 },
              _count: { _all: 1 },
              _sum: {
                quantity: { toString: () => '2' },
                totalCost: { toString: () => '0.06', toNumber: () => 0.06 },
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              resourceType: 'call',
              _count: { _all: 1 },
              _sum: {
                quantity: { toString: () => '2' },
                totalCost: { toString: () => '0.06', toNumber: () => 0.06 },
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              agentId: 'agt_123',
              _count: { _all: 1 },
              _sum: {
                quantity: { toString: () => '2' },
                totalCost: { toString: () => '0.06', toNumber: () => 0.06 },
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              settlementStatus: 'internal_debited',
              _count: { _all: 2 },
              _sum: {
                quantity: { toString: () => '3' },
                totalCost: { toString: () => '0.07', toNumber: () => 0.07 },
              },
            },
          ]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      agent: {
        findMany: jest.fn().mockResolvedValue([{ id: 'agt_123', name: 'Support Agent' }]),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.getCostSummary(
      { workspaceId: 'ws_123', projectId: 'proj_123', apiKeyId: 'key_123' },
      {},
    );

    expect(result.totals.totalCostCents).toBe(7);
    expect(result.controls.spendLimitRemainingCents).toBe(4993);
    expect(result.breakdowns.byChannel[0]).toMatchObject({
      channel: 'voice',
      unitCostCents: 3,
      totalCostCents: 6,
    });
    expect(result.breakdowns.byAgent[0]).toMatchObject({
      agentId: 'agt_123',
      agentName: 'Support Agent',
    });
  });

  it('credits balance from verified checkout completed webhook once', async () => {
    const prisma = withTransaction({
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
        upsert: jest.fn().mockResolvedValue(balanceFixture({ balanceCents: 2500 })),
      },
    });
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

    expect(result).toEqual({ received: true, duplicate: false, ignored: false });
    expect(prisma.billingBalance.upsert).toHaveBeenCalledWith({
      where: { workspaceId: 'ws_123' },
      update: { balanceCents: { increment: 2000 } },
      create: {
        id: expect.stringMatching(/^bal_/),
        workspaceId: 'ws_123',
        currency: 'USD',
        balanceCents: 2000,
      },
    });
    expect(prisma.billingTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerEventId: 'evt_123',
        status: 'succeeded',
        amountCents: 2000,
      }),
    });
  });

  it('returns duplicate without crediting for repeated Stripe event', async () => {
    const prisma = withTransaction({
      billingTransaction: {
        findFirst: jest.fn().mockResolvedValue({ id: 'btxn_existing' }),
        create: jest.fn(),
      },
      billingBalance: {
        upsert: jest.fn(),
      },
    });
    const { service } = createService(prisma, {
      constructWebhookEvent: jest.fn().mockReturnValue({
        id: 'evt_123',
        type: 'checkout.session.completed',
        data: { object: { metadata: { workspaceId: 'ws_123', amountCents: '2000' } } },
      }),
    });

    const result = await service.handleStripeWebhook(Buffer.from('{}'), 't=1,v1=test');

    expect(result).toEqual({ received: true, duplicate: true, ignored: false });
    expect(prisma.billingBalance.upsert).not.toHaveBeenCalled();
    expect(prisma.billingTransaction.create).not.toHaveBeenCalled();
  });

  it('ignores unscoped Stripe event without writing invalid workspace id', async () => {
    const prisma = withTransaction({
      billingTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    });
    const { service } = createService(prisma, {
      constructWebhookEvent: jest.fn().mockReturnValue({
        id: 'evt_unscoped',
        type: 'invoice.payment_failed',
        data: { object: {} },
      }),
    });

    const result = await service.handleStripeWebhook(Buffer.from('{}'), 't=1,v1=test');

    expect(result).toEqual({ received: true, duplicate: false, ignored: true });
    expect(prisma.billingTransaction.create).not.toHaveBeenCalled();
  });
});
