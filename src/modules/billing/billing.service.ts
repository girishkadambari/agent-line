import { Injectable, Optional } from '@nestjs/common';
import {
  BillingAllowanceSource,
  Prisma,
  UsageSettlementMode,
  type UsageEvent,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { AuditAction, EventResourceType } from '../../domain/events';
import type {
  BillingCostQueryInput,
  CreateCheckoutSessionInput,
  CreateSubscriptionCheckoutSessionInput,
  CreatePortalSessionInput,
  UpdateBillingControlsInput,
} from '../../domain/schemas';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { serializeUsageEvent } from '../usage/usage.serializer';
import { BillingRateCardService } from './billing-rate-card.service';
import {
  serializeBillingAllowanceGrant,
  serializeBillingBalance,
  serializeBillingSubscription,
  serializeBillingTransaction,
} from './billing.serializer';
import {
  StripeClientService,
  type StripeSubscription,
  type StripeWebhookEvent,
} from './stripe-client.service';

const BILLING_PLANS = [
  {
    key: 'free',
    name: 'Free trial',
    billingMode: 'trial',
    monthlyPriceCents: 0,
    includedUsageCents: 500,
    trialDays: 14,
    stripePriceEnv: null,
  },
  {
    key: 'starter',
    name: 'Starter',
    billingMode: 'subscription_usage',
    monthlyPriceCents: 2900,
    includedUsageCents: 2000,
    trialDays: 14,
    stripePriceEnv: 'STRIPE_STARTER_PRICE_ID',
  },
  {
    key: 'growth',
    name: 'Growth',
    billingMode: 'subscription_usage',
    monthlyPriceCents: 9900,
    includedUsageCents: 10000,
    trialDays: 14,
    stripePriceEnv: 'STRIPE_GROWTH_PRICE_ID',
  },
] as const;

type BillingPlanKey = (typeof BILLING_PLANS)[number]['key'];

type UsageSettlementResult = {
  settlementMode: UsageSettlementMode;
  settlementStatus: 'internal_debited';
  allowanceGrantId: string | null;
  evidence: Record<string, unknown>;
};

type BillingDbClient = PrismaService | Prisma.TransactionClient;

type AllowanceApplication = {
  allowanceGrantId: string;
  allowanceSource: BillingAllowanceSource;
  consumedCents: number;
};

type StripeWebhookResult = {
  received: true;
  duplicate: boolean;
  ignored: boolean;
  notification?: {
    type: 'payment_failed';
    workspaceId: string;
    amountCents: number;
    invoiceId?: string;
    eventId: string;
  };
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeClientService,
    private readonly audit: AuditService,
    private readonly rateCards: BillingRateCardService,
    @Optional() private readonly email?: EmailService,
  ) {}

  async getBalance(context: RequestContext) {
    const balance = await this.findOrCreateWorkspaceBalance(context.workspaceId);
    return serializeBillingBalance(balance);
  }

  async getPricing() {
    const rateCard = await this.rateCards.getActiveRateCard();

    return {
      currency: rateCard.currency,
      pricingVersion: rateCard.version,
      source: rateCard.source,
      plans: this.getPlans(),
      rates: rateCard.rates,
      billingRules: {
        currencyPrecision: 'Costs are stored as USD decimals and debited as whole cents.',
        voiceMinimum: 'Voice calls have a 1 billable minute minimum.',
        voiceRounding: 'Voice duration is rounded up to the next full minute.',
        smsUnits: 'Each inbound or outbound SMS message is 1 billable message unit.',
        numberUnits:
          'Each provisioned/imported number records 1 number unit when Vukho takes ownership.',
        stripeUsageMetering:
          'When STRIPE_USAGE_METER_EVENT_NAME is configured, finalized usage is also reported to Stripe Billing meter events.',
      },
    };
  }

  getPlans() {
    return BILLING_PLANS.map((plan) => ({
      key: plan.key,
      name: plan.name,
      billingMode: plan.billingMode,
      monthlyPriceCents: plan.monthlyPriceCents,
      includedUsageCents: plan.includedUsageCents,
      trialDays: plan.trialDays,
      stripePriceConfigured: plan.stripePriceEnv
        ? Boolean(this.stripePriceIdForPlan(plan.key as BillingPlanKey))
        : true,
    }));
  }

  async getSubscription(context: RequestContext) {
    const account = await this.createSignupBillingState(context.workspaceId);
    let subscription = await this.prisma.billingSubscription.findFirst({
      where: { workspaceId: context.workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      subscription = await this.syncLatestStripeSubscriptionForAccount(
        context.workspaceId,
        account.providerCustomerId,
      );
    }

    const allowanceGrants = await this.prisma.billingAllowanceGrant.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      billingAccount: {
        provider: account.provider,
        providerCustomerId: account.providerCustomerId,
        status: account.status,
      },
      subscription: subscription ? serializeBillingSubscription(subscription) : null,
      allowanceGrants: allowanceGrants.map(serializeBillingAllowanceGrant),
      plans: this.getPlans(),
    };
  }

  private async syncLatestStripeSubscriptionForAccount(
    workspaceId: string,
    providerCustomerId: string,
  ) {
    try {
      const subscriptions = await this.stripe.listCustomerSubscriptions(providerCustomerId);
      const subscription = this.pickRelevantStripeSubscription(subscriptions);
      if (!subscription) {
        return null;
      }

      return this.prisma.$transaction(async (tx) => {
        const syncedSubscription = await this.upsertSubscriptionFromStripeObject(
          tx,
          workspaceId,
          subscription as unknown as Record<string, unknown>,
        );
        await this.markLatestPendingSubscriptionCheckoutFromSync(tx, {
          workspaceId,
          providerCustomerId,
          planKey: syncedSubscription.planKey,
        });

        return syncedSubscription;
      });
    } catch {
      return null;
    }
  }

  private pickRelevantStripeSubscription(subscriptions: StripeSubscription[]) {
    const rank = new Map([
      ['trialing', 0],
      ['active', 1],
      ['past_due', 2],
      ['incomplete', 3],
      ['unpaid', 4],
      ['canceled', 5],
    ]);

    return [...subscriptions].sort((a, b) => {
      const statusRank = (rank.get(a.status) ?? 99) - (rank.get(b.status) ?? 99);
      if (statusRank !== 0) {
        return statusRank;
      }

      return String(b.id).localeCompare(String(a.id));
    })[0];
  }

  async createSignupBillingState(workspaceId: string) {
    const account = await this.findOrCreateStripeBillingAccount(workspaceId);
    await this.ensureTrialAllowanceGrant(workspaceId, account.providerCustomerId);
    return account;
  }

  ensureStripeCustomerForWorkspace(workspaceId: string) {
    return this.createSignupBillingState(workspaceId);
  }

  async updateControls(context: RequestContext, input: UpdateBillingControlsInput) {
    const existing = await this.findOrCreateWorkspaceBalance(context.workspaceId);
    const balance = await this.prisma.billingBalance.update({
      where: { workspaceId: context.workspaceId },
      data: {
        spendLimitCents:
          input.spendLimitCents === undefined ? existing.spendLimitCents : input.spendLimitCents,
      },
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      actorUserId: context.userId,
      action: AuditAction.BillingControlsUpdated,
      resourceType: EventResourceType.BillingBalance,
      resourceId: balance.id,
      metadata: {
        previousSpendLimitCents: existing.spendLimitCents,
        spendLimitCents: balance.spendLimitCents,
      },
    });

    return {
      balance: serializeBillingBalance(balance),
      controls: this.serializeBillingControls(balance),
    };
  }

  async getCostSummary(context: RequestContext, input: BillingCostQueryInput) {
    const where = this.createCostWhere(context, input);
    const [balance, total, byChannel, byResourceType, byAgent, bySettlementStatus, recentEvents] =
      await Promise.all([
        this.findOrCreateWorkspaceBalance(context.workspaceId),
        this.prisma.usageEvent.aggregate({
          where,
          _count: { _all: true },
          _sum: { quantity: true, totalCost: true },
        }),
        this.prisma.usageEvent.groupBy({
          by: ['channel', 'unit', 'unitCost'],
          where,
          _count: { _all: true },
          _sum: { quantity: true, totalCost: true },
          orderBy: { _sum: { totalCost: 'desc' } },
        }),
        this.prisma.usageEvent.groupBy({
          by: ['resourceType'],
          where,
          _count: { _all: true },
          _sum: { quantity: true, totalCost: true },
          orderBy: { _sum: { totalCost: 'desc' } },
        }),
        this.prisma.usageEvent.groupBy({
          by: ['agentId'],
          where,
          _count: { _all: true },
          _sum: { quantity: true, totalCost: true },
          orderBy: { _sum: { totalCost: 'desc' } },
        }),
        this.prisma.usageEvent.groupBy({
          by: ['settlementStatus'],
          where: this.createCostWhere(context, input, { includeVoided: true }),
          _count: { _all: true },
          _sum: { quantity: true, totalCost: true },
          orderBy: { settlementStatus: 'asc' },
        }),
        this.prisma.usageEvent.findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          take: 25,
        }),
      ]);
    const agentIds = byAgent.map((row) => row.agentId).filter((id): id is string => Boolean(id));
    const agents = agentIds.length
      ? await this.prisma.agent.findMany({
          where: {
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            id: { in: agentIds },
          },
          select: { id: true, name: true },
        })
      : [];
    const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
    const spentCents = this.decimalUsdToCents(total._sum.totalCost);
    const spendLimitRemainingCents =
      balance.spendLimitCents === null ? null : Math.max(balance.spendLimitCents - spentCents, 0);

    return {
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      currency: balance.currency,
      range: {
        from: input.from ?? null,
        to: input.to ?? null,
      },
      totals: {
        events: total._count._all,
        quantity: this.decimalToString(total._sum.quantity),
        totalCost: this.decimalToString(total._sum.totalCost),
        totalCostCents: spentCents,
      },
      balance: serializeBillingBalance(balance),
      controls: {
        ...this.serializeBillingControls(balance),
        spendLimitRemainingCents,
      },
      breakdowns: {
        byChannel: byChannel.map((row) => ({
          channel: row.channel,
          unit: row.unit,
          unitCost: row.unitCost.toString(),
          unitCostCents: this.decimalUsdToCents(row.unitCost),
          events: row._count._all,
          quantity: this.decimalToString(row._sum.quantity),
          totalCost: this.decimalToString(row._sum.totalCost),
          totalCostCents: this.decimalUsdToCents(row._sum.totalCost),
        })),
        byResourceType: byResourceType.map((row) => ({
          resourceType: row.resourceType,
          events: row._count._all,
          quantity: this.decimalToString(row._sum.quantity),
          totalCost: this.decimalToString(row._sum.totalCost),
          totalCostCents: this.decimalUsdToCents(row._sum.totalCost),
        })),
        byAgent: byAgent.map((row) => ({
          agentId: row.agentId,
          agentName: row.agentId ? (agentNames.get(row.agentId) ?? null) : null,
          events: row._count._all,
          quantity: this.decimalToString(row._sum.quantity),
          totalCost: this.decimalToString(row._sum.totalCost),
          totalCostCents: this.decimalUsdToCents(row._sum.totalCost),
        })),
        bySettlementStatus: bySettlementStatus.map((row) => ({
          settlementStatus: row.settlementStatus,
          events: row._count._all,
          quantity: this.decimalToString(row._sum.quantity),
          totalCost: this.decimalToString(row._sum.totalCost),
          totalCostCents: this.decimalUsdToCents(row._sum.totalCost),
        })),
      },
      recentEvents: recentEvents.map(serializeUsageEvent),
      pricing: await this.getPricing(),
    };
  }

  getStripeStatus() {
    return this.stripe.getConfigurationStatus();
  }

  async debitWorkspace(workspaceId: string, cents: number, db: BillingDbClient = this.prisma) {
    if (cents <= 0) {
      return this.findOrCreateWorkspaceBalance(workspaceId, db);
    }

    const balance = await this.findOrCreateWorkspaceBalance(workspaceId, db);

    if (balance.spendLimitCents !== null) {
      const spentCents = await this.getWorkspaceSpentCents(workspaceId, db);
      if (spentCents + cents > balance.spendLimitCents) {
        await this.notifySpendLimitReached({
          workspaceId,
          cents,
          spentCents,
          spendLimitCents: balance.spendLimitCents,
        });
        throw new ApiException(
          'insufficient_balance',
          'Usage exceeds workspace spend limit.',
          402,
          {
            cents,
            spentCents,
            spendLimitCents: balance.spendLimitCents,
          },
        );
      }
    }

    const result = await db.billingBalance.updateMany({
      where: {
        workspaceId,
        balanceCents: { gte: cents },
      },
      data: {
        balanceCents: { decrement: cents },
      },
    });

    if (result.count !== 1) {
      await this.notifyLowBalance({
        workspaceId,
        balanceCents: balance.balanceCents,
        attemptedDebitCents: cents,
        reason: 'insufficient_prepaid_balance',
      });
      throw new ApiException('insufficient_balance', 'Usage exceeds workspace spend limit.', 402, {
        cents,
        balanceCents: balance.balanceCents,
      });
    }

    const updated = await db.billingBalance.findUniqueOrThrow({
      where: { workspaceId },
    });
    await this.notifyLowBalance({
      workspaceId,
      balanceCents: updated.balanceCents,
      attemptedDebitCents: cents,
      reason: 'balance_below_threshold',
    });

    return updated;
  }

  async creditWorkspace(workspaceId: string, cents: number, db: BillingDbClient = this.prisma) {
    await this.findOrCreateWorkspaceBalance(workspaceId, db);
    return db.billingBalance.update({
      where: { workspaceId },
      data: { balanceCents: { increment: cents } },
    });
  }

  async settleUsageCharge(
    input: {
      workspaceId: string;
      cents: number;
      occurredAt?: Date;
    },
    db: BillingDbClient = this.prisma,
  ): Promise<UsageSettlementResult> {
    if (input.cents <= 0) {
      return {
        settlementMode: UsageSettlementMode.prepaid_balance,
        settlementStatus: 'internal_debited',
        allowanceGrantId: null,
        evidence: { settlementReason: 'zero_cost' },
      };
    }

    const allowance = await this.consumeAllowanceGrants(
      {
        workspaceId: input.workspaceId,
        cents: input.cents,
        occurredAt: input.occurredAt ?? new Date(),
      },
      db,
    );

    if (allowance.remainingCents === 0) {
      return {
        settlementMode: allowance.settlementMode,
        settlementStatus: 'internal_debited',
        allowanceGrantId: allowance.allowanceGrantId,
        evidence: allowance.evidence,
      };
    }

    const subscription = await db.billingSubscription.findFirst({
      where: {
        workspaceId: input.workspaceId,
        status: { in: ['trialing', 'active'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (subscription && this.stripe.isUsageMeteringConfigured()) {
      return {
        settlementMode: UsageSettlementMode.stripe_meter,
        settlementStatus: 'internal_debited',
        allowanceGrantId: allowance.allowanceGrantId,
        evidence: {
          settlementReason: 'active_subscription_metered_overage',
          allowanceApplications: allowance.applications,
          allowanceConsumedCents: allowance.consumedCents,
          remainderCents: allowance.remainingCents,
          subscriptionId: subscription.id,
          providerSubscriptionId: subscription.providerSubscriptionId,
          planKey: subscription.planKey,
        },
      };
    }

    await this.debitWorkspace(input.workspaceId, allowance.remainingCents, db);
    return {
      settlementMode: UsageSettlementMode.prepaid_balance,
      settlementStatus: 'internal_debited',
      allowanceGrantId: allowance.allowanceGrantId,
      evidence: {
        settlementReason:
          allowance.consumedCents > 0 ? 'allowance_then_prepaid_balance' : 'prepaid_balance',
        allowanceApplications: allowance.applications,
        allowanceConsumedCents: allowance.consumedCents,
        remainderCents: allowance.remainingCents,
      },
    };
  }

  async adjustSettledUsageCharge(event: UsageEvent, deltaCents: number) {
    if (deltaCents === 0) {
      return {
        settlementMode: event.settlementMode,
        allowanceGrantId: event.allowanceGrantId,
        evidence: { settlementReason: 'no_delta' },
      };
    }

    return this.runBillingTransaction(async (tx) => {
      if (deltaCents < 0) {
        const refundCents = Math.abs(deltaCents);
        const allowanceRefundCents = await this.refundAllowanceApplications(event, refundCents, tx);
        const remainingRefundCents = refundCents - allowanceRefundCents;

        if (
          remainingRefundCents > 0 &&
          event.settlementMode === UsageSettlementMode.prepaid_balance
        ) {
          await this.creditWorkspace(event.workspaceId, remainingRefundCents, tx);
        }

        const result = {
          settlementMode: event.settlementMode,
          allowanceGrantId: event.allowanceGrantId,
          evidence: {
            settlementReason:
              allowanceRefundCents > 0 ? 'allowance_settlement_refund' : 'settlement_refund',
            refundCents,
            allowanceRefundCents,
            prepaidRefundCents:
              event.settlementMode === UsageSettlementMode.prepaid_balance
                ? remainingRefundCents
                : 0,
          },
        };
        await this.recordUsageSettlementAdjustment(event, deltaCents, result, tx);
        return result;
      }

      const result = await this.settleUsageCharge(
        {
          workspaceId: event.workspaceId,
          cents: deltaCents,
          occurredAt: event.occurredAt,
        },
        tx,
      );
      await this.recordUsageSettlementAdjustment(event, deltaCents, result, tx);
      return result;
    });
  }

  private async recordUsageSettlementAdjustment(
    event: UsageEvent,
    deltaCents: number,
    settlement: {
      settlementMode: UsageSettlementMode;
      allowanceGrantId: string | null;
      evidence: Record<string, unknown>;
    },
    db: BillingDbClient = this.prisma,
  ) {
    const previousTotalCents = this.decimalUsdToCents(event.totalCost);
    const finalTotalCents = previousTotalCents + deltaCents;

    await db.billingTransaction.create({
      data: {
        id: createId('btxn'),
        workspaceId: event.workspaceId,
        provider: 'vukho',
        type: 'usage.settlement_adjustment',
        amountCents: deltaCents,
        currency: 'USD',
        status: 'succeeded',
        metadata: {
          usageEventId: event.id,
          projectId: event.projectId,
          agentId: event.agentId,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          channel: event.channel,
          pricingVersion: event.pricingVersion,
          previousTotalCents,
          finalTotalCents,
          deltaCents,
          settlementMode: settlement.settlementMode,
          allowanceGrantId: settlement.allowanceGrantId,
          settlementEvidence: settlement.evidence,
        } as Prisma.InputJsonValue,
      },
    });
  }

  async reportUsageEventToStripe(event: UsageEvent) {
    if (event.settlementStatus === 'stripe_reported') {
      return {
        status: 'stripe_reported' as const,
        stripeMeterEventId: event.stripeMeterEventId ?? undefined,
      };
    }

    if (!this.stripe.isUsageMeteringConfigured()) {
      return { status: 'internal_debited' as const };
    }

    const account = await this.prisma.billingAccount.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId: event.workspaceId,
          provider: 'stripe',
        },
      },
    });

    if (!account) {
      return { status: 'stripe_failed' as const };
    }

    try {
      const meterEvent = await this.stripe.createUsageMeterEvent({
        identifier: event.id,
        customerId: account.providerCustomerId,
        value: this.decimalUsdToCents(event.totalCost),
        usageEventId: event.id,
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        channel: event.channel,
        timestamp: event.occurredAt,
      });

      return {
        status: 'stripe_reported' as const,
        stripeMeterEventId: meterEvent.identifier,
      };
    } catch {
      return { status: 'stripe_failed' as const };
    }
  }

  async createCheckoutSession(context: RequestContext, input: CreateCheckoutSessionInput) {
    const account = await this.findOrCreateStripeBillingAccount(context.workspaceId);
    const session = await this.stripe.createCheckoutSession({
      workspaceId: context.workspaceId,
      customerId: account.providerCustomerId,
      amountCents: input.amountCents,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });

    const transaction = await this.prisma.billingTransaction.create({
      data: {
        id: createId('btxn'),
        workspaceId: context.workspaceId,
        provider: 'stripe',
        type: 'checkout_session.created',
        amountCents: input.amountCents,
        currency: 'USD',
        status: 'pending',
        metadata: {
          checkoutSessionId: session.id,
          customerId: session.customer,
          stripeMode: this.stripe.getMode(),
        } as Prisma.InputJsonValue,
      },
    });

    return {
      id: session.id,
      url: session.url,
      mode: this.stripe.getMode(),
      transaction: serializeBillingTransaction(transaction),
    };
  }

  async createSubscriptionCheckoutSession(
    context: RequestContext,
    input: CreateSubscriptionCheckoutSessionInput,
  ) {
    const plan = this.findPlan(input.planKey);
    const priceId = this.requiredStripePriceIdForPlan(plan.key);
    const account = await this.findOrCreateStripeBillingAccount(context.workspaceId);
    const session = await this.stripe.createSubscriptionCheckoutSession({
      workspaceId: context.workspaceId,
      customerId: account.providerCustomerId,
      planKey: plan.key,
      priceId,
      trialDays: plan.trialDays,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });

    const transaction = await this.prisma.billingTransaction.create({
      data: {
        id: createId('btxn'),
        workspaceId: context.workspaceId,
        provider: 'stripe',
        type: 'subscription_checkout_session.created',
        amountCents: plan.monthlyPriceCents,
        currency: 'USD',
        status: 'pending',
        metadata: {
          checkoutSessionId: session.id,
          customerId: session.customer,
          subscriptionId: session.subscription,
          planKey: plan.key,
          stripePriceId: priceId,
          stripeMode: this.stripe.getMode(),
        } as Prisma.InputJsonValue,
      },
    });

    return {
      id: session.id,
      url: session.url,
      mode: this.stripe.getMode(),
      plan: {
        key: plan.key,
        name: plan.name,
        monthlyPriceCents: plan.monthlyPriceCents,
        includedUsageCents: plan.includedUsageCents,
        trialDays: plan.trialDays,
      },
      transaction: serializeBillingTransaction(transaction),
    };
  }

  async createPortalSession(context: RequestContext, input: CreatePortalSessionInput) {
    const account = await this.findOrCreateStripeBillingAccount(context.workspaceId);
    const session = await this.stripe.createPortalSession({
      customerId: account.providerCustomerId,
      returnUrl: input.returnUrl,
    });

    return {
      id: session.id,
      url: session.url,
      customerId: session.customer,
      mode: this.stripe.getMode(),
    };
  }

  async listTransactions(context: RequestContext, limit: number) {
    const transactions = await this.prisma.billingTransaction.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return list(transactions.map(serializeBillingTransaction), { limit, hasMore: false, nextCursor: null });
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
    const event = this.stripe.constructWebhookEvent(rawBody, signature);

    try {
      const result = await this.prisma.$transaction(async (tx): Promise<StripeWebhookResult> => {
        const existing = await tx.billingTransaction.findFirst({
          where: {
            provider: 'stripe',
            providerEventId: event.id,
          },
        });

        if (existing) {
          return { received: true, duplicate: true, ignored: false };
        }

        if (event.type === 'checkout.session.completed') {
          await this.handleCheckoutCompleted(tx, event);
          return { received: true, duplicate: false, ignored: false };
        }

        if (event.type === 'checkout.session.expired') {
          await this.handleCheckoutExpired(tx, event);
          return { received: true, duplicate: false, ignored: false };
        }

        if (event.type.startsWith('customer.subscription.')) {
          const handled = await this.handleSubscriptionEvent(tx, event);
          return { received: true, duplicate: false, ignored: !handled };
        }

        if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
          const handled = await this.handleInvoiceEvent(tx, event);
          return {
            received: true,
            duplicate: false,
            ignored: !handled.handled,
            notification: handled.notification,
          };
        }

        const workspaceId = this.workspaceIdFromEvent(event);
        if (!workspaceId) {
          return { received: true, duplicate: false, ignored: true };
        }

        await tx.billingTransaction.create({
          data: {
            id: createId('btxn'),
            workspaceId,
            provider: 'stripe',
            providerEventId: event.id,
            type: event.type,
            amountCents: 0,
            currency: 'USD',
            status: 'ignored',
            metadata: event.data.object as Prisma.InputJsonValue,
          },
        });

        return { received: true, duplicate: false, ignored: true };
      });

      if (result.notification?.type === 'payment_failed') {
        await this.notifyPaymentFailed(result.notification);
      }

      return {
        received: result.received,
        duplicate: result.duplicate,
        ignored: result.ignored,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return { received: true, duplicate: true, ignored: false };
      }

      throw error;
    }
  }

  private async runBillingTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(callback);
    }

    return callback(this.prisma as unknown as Prisma.TransactionClient);
  }

  private async refundAllowanceApplications(
    event: UsageEvent,
    refundCents: number,
    db: BillingDbClient,
  ) {
    const applications = this.allowanceApplicationsFromEvent(event);
    let remainingRefundCents = refundCents;
    let refundedAllowanceCents = 0;

    for (const application of applications) {
      if (remainingRefundCents <= 0) {
        break;
      }

      const applicationRefundCents = Math.min(application.consumedCents, remainingRefundCents);
      const result = await db.billingAllowanceGrant.updateMany({
        where: {
          id: application.allowanceGrantId,
          consumedCents: { gte: applicationRefundCents },
        },
        data: { consumedCents: { decrement: applicationRefundCents } },
      });

      if (result.count !== 1) {
        continue;
      }

      remainingRefundCents -= applicationRefundCents;
      refundedAllowanceCents += applicationRefundCents;
    }

    return refundedAllowanceCents;
  }

  private allowanceApplicationsFromEvent(event: UsageEvent): AllowanceApplication[] {
    const evidence = event.evidence as Record<string, unknown> | null;
    const settlementEvidence = evidence?.settlement as Record<string, unknown> | undefined;
    const applications =
      (settlementEvidence?.allowanceApplications as AllowanceApplication[] | undefined) ??
      (evidence?.allowanceApplications as AllowanceApplication[] | undefined);

    if (Array.isArray(applications)) {
      return applications
        .map((application) => ({
          allowanceGrantId: String(application.allowanceGrantId ?? ''),
          allowanceSource: application.allowanceSource,
          consumedCents: Number(application.consumedCents ?? 0),
        }))
        .filter((application) => application.allowanceGrantId && application.consumedCents > 0);
    }

    if (!event.allowanceGrantId) {
      return [];
    }

    return [
      {
        allowanceGrantId: event.allowanceGrantId,
        allowanceSource:
          event.settlementMode === UsageSettlementMode.trial_allowance
            ? BillingAllowanceSource.trial
            : BillingAllowanceSource.subscription_included,
        consumedCents: this.decimalUsdToCents(event.totalCost),
      },
    ];
  }

  private async getWorkspaceSpentCents(workspaceId: string, db: BillingDbClient = this.prisma) {
    const aggregate = await db.usageEvent.aggregate({
      where: { workspaceId, settlementStatus: { not: 'voided' } },
      _sum: { totalCost: true },
    });
    const totalCost = aggregate._sum.totalCost;

    if (!totalCost) {
      return 0;
    }

    return Math.round(totalCost.toNumber() * 100);
  }

  private async consumeAllowanceGrants(
    input: {
      workspaceId: string;
      cents: number;
      occurredAt: Date;
    },
    db: BillingDbClient = this.prisma,
  ): Promise<{
    consumedCents: number;
    remainingCents: number;
    allowanceGrantId: string | null;
    settlementMode: UsageSettlementMode;
    applications: AllowanceApplication[];
    evidence: Record<string, unknown>;
  }> {
    const grants = await db.billingAllowanceGrant.findMany({
      where: {
        workspaceId: input.workspaceId,
        source: {
          in: [BillingAllowanceSource.trial, BillingAllowanceSource.subscription_included],
        },
        OR: [{ expiresAt: null }, { expiresAt: { gte: input.occurredAt } }],
        AND: [
          { OR: [{ periodStart: null }, { periodStart: { lte: input.occurredAt } }] },
          { OR: [{ periodEnd: null }, { periodEnd: { gte: input.occurredAt } }] },
        ],
      },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });

    const applications: AllowanceApplication[] = [];
    let remainingToSettleCents = input.cents;

    for (const grant of grants) {
      const remainingCents = grant.amountCents - grant.consumedCents;
      if (remainingCents <= 0) {
        continue;
      }

      const consumeCents = Math.min(remainingToSettleCents, remainingCents);
      const result = await db.billingAllowanceGrant.updateMany({
        where: {
          id: grant.id,
          consumedCents: { lte: grant.amountCents - consumeCents },
        },
        data: { consumedCents: { increment: consumeCents } },
      });

      if (result.count !== 1) {
        continue;
      }

      applications.push({
        allowanceGrantId: grant.id,
        allowanceSource: grant.source,
        consumedCents: consumeCents,
      });
      remainingToSettleCents -= consumeCents;

      if (remainingToSettleCents <= 0) {
        break;
      }
    }

    const consumedCents = input.cents - remainingToSettleCents;
    const firstApplication = applications[0] ?? null;
    const settlementMode =
      firstApplication?.allowanceSource === BillingAllowanceSource.trial
        ? UsageSettlementMode.trial_allowance
        : UsageSettlementMode.included_allowance;

    return {
      consumedCents,
      remainingCents: remainingToSettleCents,
      allowanceGrantId: firstApplication?.allowanceGrantId ?? null,
      settlementMode,
      applications,
      evidence: {
        settlementReason:
          settlementMode === UsageSettlementMode.trial_allowance
            ? 'trial_allowance'
            : 'subscription_included_allowance',
        allowanceApplications: applications,
        allowanceConsumedCents: consumedCents,
        remainderCents: remainingToSettleCents,
      },
    };
  }

  private createCostWhere(
    context: RequestContext,
    input: BillingCostQueryInput,
    options: { includeVoided?: boolean } = {},
  ): Prisma.UsageEventWhereInput {
    return {
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      settlementStatus: options.includeVoided ? undefined : { not: 'voided' },
      occurredAt: {
        gte: input.from ? new Date(input.from) : undefined,
        lte: input.to ? new Date(input.to) : undefined,
      },
    };
  }

  private serializeBillingControls(balance: {
    balanceCents: number;
    spendLimitCents: number | null;
  }) {
    return {
      prepaidRequired: true,
      spendLimitCents: balance.spendLimitCents,
      balanceCents: balance.balanceCents,
      canSpend: balance.balanceCents > 0,
      lowBalance: balance.balanceCents <= 500,
    };
  }

  private decimalToString(value: Decimal | null) {
    return value?.toString() ?? '0';
  }

  private decimalUsdToCents(value: Decimal | null) {
    if (!value) {
      return 0;
    }

    return Math.round(value.toNumber() * 100);
  }

  private async findOrCreateWorkspaceBalance(
    workspaceId: string,
    db: BillingDbClient = this.prisma,
  ) {
    const existing = await db.billingBalance.findUnique({
      where: { workspaceId },
    });

    if (existing) {
      return existing;
    }

    try {
      return await db.billingBalance.create({
        data: {
          id: createId('bal'),
          workspaceId,
          currency: 'USD',
          balanceCents: 500,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      return db.billingBalance.findUniqueOrThrow({
        where: { workspaceId },
      });
    }
  }

  private async findOrCreateStripeBillingAccount(workspaceId: string) {
    const existing = await this.prisma.billingAccount.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: 'stripe',
        },
      },
    });

    if (existing) {
      return existing;
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    const customer = await this.stripe.createCustomer({
      workspaceId,
      name: workspace?.name ?? workspaceId,
    });

    try {
      return await this.prisma.billingAccount.create({
        data: {
          id: createId('bacc'),
          workspaceId,
          provider: 'stripe',
          providerCustomerId: customer.id,
          status: 'active',
          defaultCurrency: 'USD',
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      return this.prisma.billingAccount.findUniqueOrThrow({
        where: {
          workspaceId_provider: {
            workspaceId,
            provider: 'stripe',
          },
        },
      });
    }
  }

  private async ensureTrialAllowanceGrant(workspaceId: string, providerCustomerId: string) {
    const existingTrial = await this.prisma.billingAllowanceGrant.findFirst({
      where: {
        workspaceId,
        source: 'trial',
      },
    });

    if (existingTrial) {
      return existingTrial;
    }

    const trialPlan = this.findPlan('free');
    const now = new Date();
    const periodEnd = new Date(now.getTime() + trialPlan.trialDays * 24 * 60 * 60 * 1000);

    try {
      return await this.prisma.billingAllowanceGrant.create({
        data: {
          id: createId('balg'),
          workspaceId,
          source: 'trial',
          idempotencyKey: this.allowanceIdempotencyKey('trial', workspaceId),
          amountCents: trialPlan.includedUsageCents,
          currency: 'USD',
          periodStart: now,
          periodEnd,
          expiresAt: periodEnd,
          metadata: {
            planKey: trialPlan.key,
            providerCustomerId,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      return this.prisma.billingAllowanceGrant.findFirstOrThrow({
        where: {
          workspaceId,
          source: 'trial',
        },
      });
    }
  }

  private async handleCheckoutCompleted(tx: Prisma.TransactionClient, event: StripeWebhookEvent) {
    const stripeObject = event.data.object;
    const workspaceId = this.workspaceIdFromEvent(event);

    if (!workspaceId) {
      throw new ApiException('invalid_request', 'Stripe event is missing workspace id.', 400);
    }

    const metadata = stripeObject.metadata as Record<string, unknown> | undefined;
    const purpose = String(metadata?.purpose ?? '');
    if (purpose === 'subscription') {
      await this.upsertSubscriptionFromStripeObject(tx, workspaceId, stripeObject);
      await this.markPendingCheckoutTransaction(tx, {
        workspaceId,
        checkoutSessionId: String(stripeObject.id ?? ''),
        type: 'subscription_checkout_session.created',
        status: 'succeeded',
      });
      await tx.billingTransaction.create({
        data: {
          id: createId('btxn'),
          workspaceId,
          provider: 'stripe',
          providerEventId: event.id,
          type: event.type,
          amountCents: Number(stripeObject.amount_total ?? 0),
          currency: String(stripeObject.currency ?? 'usd').toUpperCase(),
          status: 'succeeded',
          metadata: stripeObject as Prisma.InputJsonValue,
        },
      });
      await this.recordBillingAudit(tx, {
        workspaceId,
        action: AuditAction.BillingSubscriptionSynced,
        resourceType: EventResourceType.BillingSubscription,
        resourceId: String(stripeObject.subscription ?? stripeObject.id ?? ''),
        metadata: {
          eventId: event.id,
          eventType: event.type,
          checkoutSessionId: stripeObject.id,
          planKey: metadata?.planKey,
          amountCents: Number(stripeObject.amount_total ?? 0),
          currency: String(stripeObject.currency ?? 'usd').toUpperCase(),
        },
      });
      return;
    }

    const amountCents = this.amountCentsFromCheckoutSession(stripeObject);
    await this.markPendingCheckoutTransaction(tx, {
      workspaceId,
      checkoutSessionId: String(stripeObject.id ?? ''),
      type: 'checkout_session.created',
      status: 'succeeded',
    });
    await tx.billingTransaction.create({
      data: {
        id: createId('btxn'),
        workspaceId,
        provider: 'stripe',
        providerEventId: event.id,
        type: event.type,
        amountCents,
        currency: String(stripeObject.currency ?? 'usd').toUpperCase(),
        status: 'succeeded',
        metadata: stripeObject as Prisma.InputJsonValue,
      },
    });
    await tx.billingBalance.upsert({
      where: { workspaceId },
      update: { balanceCents: { increment: amountCents } },
      create: {
        id: createId('bal'),
        workspaceId,
        currency: 'USD',
        balanceCents: amountCents,
      },
    });
    await this.recordBillingAudit(tx, {
      workspaceId,
      action: AuditAction.BillingCreditApplied,
      resourceType: EventResourceType.BillingBalance,
      metadata: {
        eventId: event.id,
        eventType: event.type,
        checkoutSessionId: stripeObject.id,
        amountCents,
        currency: String(stripeObject.currency ?? 'usd').toUpperCase(),
      },
    });
  }

  private async handleCheckoutExpired(tx: Prisma.TransactionClient, event: StripeWebhookEvent) {
    const stripeObject = event.data.object;
    const workspaceId = this.workspaceIdFromEvent(event);

    if (!workspaceId) {
      return;
    }

    const metadata = stripeObject.metadata as Record<string, unknown> | undefined;
    const purpose = String(metadata?.purpose ?? '');
    await this.markPendingCheckoutTransaction(tx, {
      workspaceId,
      checkoutSessionId: String(stripeObject.id ?? ''),
      type:
        purpose === 'subscription'
          ? 'subscription_checkout_session.created'
          : 'checkout_session.created',
      status: 'expired',
    });

    await tx.billingTransaction.create({
      data: {
        id: createId('btxn'),
        workspaceId,
        provider: 'stripe',
        providerEventId: event.id,
        type: event.type,
        amountCents: Number(stripeObject.amount_total ?? 0),
        currency: String(stripeObject.currency ?? 'usd').toUpperCase(),
        status: 'expired',
        metadata: stripeObject as Prisma.InputJsonValue,
      },
    });
    await this.recordBillingAudit(tx, {
      workspaceId,
      action: AuditAction.BillingCheckoutExpired,
      resourceType: EventResourceType.BillingTransaction,
      metadata: {
        eventId: event.id,
        eventType: event.type,
        checkoutSessionId: stripeObject.id,
        purpose,
      },
    });
  }

  private async handleSubscriptionEvent(tx: Prisma.TransactionClient, event: StripeWebhookEvent) {
    const stripeObject = event.data.object;
    const workspaceId = await this.workspaceIdFromEventOrCustomer(tx, event);

    if (!workspaceId) {
      return false;
    }

    await this.upsertSubscriptionFromStripeObject(tx, workspaceId, stripeObject);
    await tx.billingTransaction.create({
      data: {
        id: createId('btxn'),
        workspaceId,
        provider: 'stripe',
        providerEventId: event.id,
        type: event.type,
        amountCents: 0,
        currency: String(stripeObject.currency ?? 'usd').toUpperCase(),
        status: 'succeeded',
        metadata: stripeObject as Prisma.InputJsonValue,
      },
    });
    await this.recordBillingAudit(tx, {
      workspaceId,
      action: AuditAction.BillingSubscriptionSynced,
      resourceType: EventResourceType.BillingSubscription,
      resourceId: String(stripeObject.id ?? stripeObject.subscription ?? ''),
      metadata: {
        eventId: event.id,
        eventType: event.type,
        providerSubscriptionId: stripeObject.id,
        status: stripeObject.status,
      },
    });

    return true;
  }

  private async handleInvoiceEvent(tx: Prisma.TransactionClient, event: StripeWebhookEvent) {
    const stripeObject = event.data.object;
    const workspaceId = await this.workspaceIdFromEventOrCustomer(tx, event);

    if (!workspaceId) {
      return { handled: false as const };
    }

    const amountCents = Number(stripeObject.amount_paid ?? stripeObject.amount_due ?? 0);
    await tx.billingTransaction.create({
      data: {
        id: createId('btxn'),
        workspaceId,
        provider: 'stripe',
        providerEventId: event.id,
        type: event.type,
        amountCents,
        currency: String(stripeObject.currency ?? 'usd').toUpperCase(),
        status: event.type === 'invoice.paid' ? 'succeeded' : 'failed',
        metadata: stripeObject as Prisma.InputJsonValue,
      },
    });
    await this.recordBillingAudit(tx, {
      workspaceId,
      action:
        event.type === 'invoice.paid'
          ? AuditAction.BillingInvoicePaid
          : AuditAction.BillingInvoicePaymentFailed,
      resourceType: EventResourceType.BillingTransaction,
      resourceId: String(stripeObject.id ?? ''),
      metadata: {
        eventId: event.id,
        eventType: event.type,
        invoiceId: stripeObject.id,
        amountCents,
        currency: String(stripeObject.currency ?? 'usd').toUpperCase(),
        providerSubscriptionId: stripeObject.subscription,
      },
    });

    if (event.type !== 'invoice.paid') {
      return {
        handled: true as const,
        notification: {
          type: 'payment_failed' as const,
          workspaceId,
          amountCents,
          invoiceId: String(stripeObject.id ?? ''),
          eventId: event.id,
        },
      };
    }

    const subscription = await this.findSubscriptionForStripeObject(tx, workspaceId, stripeObject);
    if (!subscription) {
      return { handled: true as const };
    }

    const plan = this.findPlan(subscription.planKey as BillingPlanKey);
    if (plan.includedUsageCents <= 0) {
      return { handled: true as const };
    }

    const periodStart = this.dateFromUnix(stripeObject.period_start);
    const periodEnd = this.dateFromUnix(stripeObject.period_end);
    const invoiceId = String(stripeObject.id ?? '');
    await tx.billingAllowanceGrant.upsert({
      where: {
        idempotencyKey: this.allowanceIdempotencyKey('stripe_invoice', invoiceId),
      },
      update: {},
      create: {
        id: createId('balg'),
        workspaceId,
        subscriptionId: subscription.id,
        source: 'subscription_included',
        idempotencyKey: this.allowanceIdempotencyKey('stripe_invoice', invoiceId),
        amountCents: plan.includedUsageCents,
        currency: String(stripeObject.currency ?? 'usd').toUpperCase(),
        periodStart,
        periodEnd,
        expiresAt: periodEnd,
        metadata: {
          invoiceId,
          planKey: plan.key,
          providerSubscriptionId: subscription.providerSubscriptionId,
        } as Prisma.InputJsonValue,
      },
    });

    return { handled: true as const };
  }

  private async notifyLowBalance(input: {
    workspaceId: string;
    balanceCents: number;
    attemptedDebitCents: number;
    reason: string;
  }) {
    if (!this.email || input.balanceCents > 500) {
      return;
    }

    await this.email
      .sendWorkspaceBillingAlertEmail({
        workspaceId: input.workspaceId,
        kind: 'low_balance',
        balanceCents: input.balanceCents,
        amountCents: input.attemptedDebitCents,
        idempotencyScope: this.dailyIdempotencyScope(input.reason),
      })
      .catch(() => undefined);
  }

  private async notifySpendLimitReached(input: {
    workspaceId: string;
    cents: number;
    spentCents: number;
    spendLimitCents: number;
  }) {
    if (!this.email) {
      return;
    }

    await this.email
      .sendWorkspaceBillingAlertEmail({
        workspaceId: input.workspaceId,
        kind: 'spend_limit_reached',
        amountCents: input.cents,
        balanceCents: input.spentCents,
        spendLimitCents: input.spendLimitCents,
        idempotencyScope: this.dailyIdempotencyScope('spend_limit_reached'),
      })
      .catch(() => undefined);
  }

  private async notifyPaymentFailed(input: {
    workspaceId: string;
    amountCents: number;
    invoiceId?: string;
    eventId: string;
  }) {
    if (!this.email) {
      return;
    }

    await this.email
      .sendWorkspaceBillingAlertEmail({
        workspaceId: input.workspaceId,
        kind: 'payment_failed',
        amountCents: input.amountCents,
        invoiceId: input.invoiceId,
        idempotencyScope: input.eventId,
      })
      .catch(() => undefined);
  }

  private dailyIdempotencyScope(reason: string) {
    return `${reason}:${new Date().toISOString().slice(0, 10)}`;
  }

  private allowanceIdempotencyKey(source: string, key: string) {
    return `${source}:${key}`;
  }

  private async recordBillingAudit(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      action: string;
      resourceType: string;
      resourceId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.auditEvent.create({
      data: {
        id: createId('audit'),
        workspaceId: input.workspaceId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  private async upsertSubscriptionFromStripeObject(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    stripeObject: Record<string, unknown>,
  ) {
    const metadata = stripeObject.metadata as Record<string, unknown> | undefined;
    const planKey = String(
      metadata?.planKey ?? this.planKeyFromStripeObject(stripeObject) ?? 'starter',
    );
    const customerId = String(stripeObject.customer ?? '');
    const subscriptionId = String(stripeObject.subscription ?? stripeObject.id ?? '');
    const priceId = this.priceIdFromStripeObject(stripeObject);
    const status = this.normalizeSubscriptionStatus(String(stripeObject.status ?? 'trialing'));

    if (customerId) {
      await tx.billingAccount.upsert({
        where: {
          workspaceId_provider: {
            workspaceId,
            provider: 'stripe',
          },
        },
        update: {
          providerCustomerId: customerId,
          status: 'active',
        },
        create: {
          id: createId('bacc'),
          workspaceId,
          provider: 'stripe',
          providerCustomerId: customerId,
          status: 'active',
          defaultCurrency: 'USD',
        },
      });
    }

    return tx.billingSubscription.upsert({
      where: {
        provider_providerSubscriptionId: {
          provider: 'stripe',
          providerSubscriptionId: subscriptionId,
        },
      },
      update: {
        providerCustomerId: customerId,
        providerPriceId: priceId,
        planKey,
        status,
        currentPeriodStart: this.dateFromUnix(stripeObject.current_period_start),
        currentPeriodEnd: this.dateFromUnix(stripeObject.current_period_end),
        trialEndsAt: this.dateFromUnix(stripeObject.trial_end),
        cancelAtPeriodEnd: Boolean(stripeObject.cancel_at_period_end),
        metadata: stripeObject as Prisma.InputJsonValue,
      },
      create: {
        id: createId('bsub'),
        workspaceId,
        provider: 'stripe',
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        providerPriceId: priceId,
        planKey,
        status,
        billingMode: 'subscription_usage',
        currentPeriodStart: this.dateFromUnix(stripeObject.current_period_start),
        currentPeriodEnd: this.dateFromUnix(stripeObject.current_period_end),
        trialEndsAt: this.dateFromUnix(stripeObject.trial_end),
        cancelAtPeriodEnd: Boolean(stripeObject.cancel_at_period_end),
        metadata: stripeObject as Prisma.InputJsonValue,
      },
    });
  }

  private async markPendingCheckoutTransaction(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      checkoutSessionId: string;
      type: 'checkout_session.created' | 'subscription_checkout_session.created';
      status: 'succeeded' | 'expired';
    },
  ) {
    if (!input.checkoutSessionId) {
      return;
    }

    const pendingTransactions = await tx.billingTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
        provider: 'stripe',
        type: input.type,
        status: 'pending',
      },
      take: 25,
    });
    const matching = pendingTransactions.find((transaction) => {
      const metadata = transaction.metadata as Record<string, unknown> | null;
      return metadata?.checkoutSessionId === input.checkoutSessionId;
    });

    if (!matching) {
      return;
    }

    await tx.billingTransaction.update({
      where: { id: matching.id },
      data: {
        status: input.status,
        metadata: {
          ...((matching.metadata as Record<string, unknown> | null) ?? {}),
          reconciledAt: new Date().toISOString(),
          reconciledBy: 'stripe_webhook',
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async markLatestPendingSubscriptionCheckoutFromSync(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      providerCustomerId: string;
      planKey: string;
    },
  ) {
    const pendingTransactions = await tx.billingTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
        provider: 'stripe',
        type: 'subscription_checkout_session.created',
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const matching = pendingTransactions.find((transaction) => {
      const metadata = transaction.metadata as Record<string, unknown> | null;
      return (
        metadata?.customerId === input.providerCustomerId && metadata?.planKey === input.planKey
      );
    });

    if (!matching) {
      return;
    }

    await tx.billingTransaction.update({
      where: { id: matching.id },
      data: {
        status: 'succeeded',
        metadata: {
          ...((matching.metadata as Record<string, unknown> | null) ?? {}),
          reconciledAt: new Date().toISOString(),
          reconciledBy: 'stripe_subscription_sync',
        } as Prisma.InputJsonValue,
      },
    });
  }

  private workspaceIdFromEvent(event: StripeWebhookEvent) {
    const stripeObject = event.data.object;
    const metadata = stripeObject.metadata as Record<string, unknown> | undefined;
    return (metadata?.workspaceId ?? stripeObject.client_reference_id) as string | undefined;
  }

  private async workspaceIdFromEventOrCustomer(
    tx: Prisma.TransactionClient,
    event: StripeWebhookEvent,
  ) {
    const workspaceId = this.workspaceIdFromEvent(event);
    if (workspaceId) {
      return workspaceId;
    }

    const customerId = event.data.object.customer;
    if (!customerId) {
      return undefined;
    }

    const account = await tx.billingAccount.findUnique({
      where: {
        provider_providerCustomerId: {
          provider: 'stripe',
          providerCustomerId: String(customerId),
        },
      },
    });

    return account?.workspaceId;
  }

  private async findSubscriptionForStripeObject(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    stripeObject: Record<string, unknown>,
  ) {
    const subscriptionId = String(stripeObject.subscription ?? '');
    if (!subscriptionId) {
      return null;
    }

    return tx.billingSubscription.findFirst({
      where: {
        workspaceId,
        provider: 'stripe',
        providerSubscriptionId: subscriptionId,
      },
    });
  }

  private findPlan(key: BillingPlanKey | string) {
    const plan = BILLING_PLANS.find((candidate) => candidate.key === key);
    if (!plan) {
      throw new ApiException('invalid_request', 'Unknown billing plan.', 400, { planKey: key });
    }
    return plan;
  }

  private stripePriceIdForPlan(key: BillingPlanKey) {
    const plan = this.findPlan(key);
    return plan.stripePriceEnv ? process.env[plan.stripePriceEnv] : undefined;
  }

  private requiredStripePriceIdForPlan(key: BillingPlanKey) {
    const priceId = this.stripePriceIdForPlan(key);
    if (!priceId) {
      throw new ApiException(
        'provider_error',
        'Stripe price id is not configured for billing plan.',
        500,
        {
          planKey: key,
        },
      );
    }
    return priceId;
  }

  private normalizeSubscriptionStatus(status: string) {
    if (['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'].includes(status)) {
      return status as 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';
    }
    return 'incomplete';
  }

  private dateFromUnix(value: unknown) {
    const seconds = Number(value ?? 0);
    return seconds > 0 ? new Date(seconds * 1000) : null;
  }

  private planKeyFromStripeObject(stripeObject: Record<string, unknown>) {
    const priceId = this.priceIdFromStripeObject(stripeObject);
    if (!priceId) {
      return undefined;
    }

    return BILLING_PLANS.find((plan) => {
      return plan.stripePriceEnv ? process.env[plan.stripePriceEnv] === priceId : false;
    })?.key;
  }

  private priceIdFromStripeObject(stripeObject: Record<string, unknown>) {
    const items = stripeObject.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
    return items?.data?.[0]?.price?.id ?? null;
  }

  private amountCentsFromCheckoutSession(stripeObject: Record<string, unknown>) {
    const metadata = stripeObject.metadata as Record<string, unknown> | undefined;
    const metadataAmount = Number.parseInt(String(metadata?.amountCents ?? ''), 10);

    if (!Number.isNaN(metadataAmount) && metadataAmount > 0) {
      return metadataAmount;
    }

    const amountTotal = Number(stripeObject.amount_total ?? 0);

    if (amountTotal <= 0) {
      throw new ApiException('invalid_request', 'Stripe checkout session has no amount.', 400);
    }

    return amountTotal;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
