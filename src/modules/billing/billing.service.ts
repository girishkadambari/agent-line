import { Injectable } from '@nestjs/common';
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
import type {
  BillingCostQueryInput,
  CreateCheckoutSessionInput,
  CreateSubscriptionCheckoutSessionInput,
  CreatePortalSessionInput,
  UpdateBillingControlsInput,
} from '../../domain/schemas';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { USAGE_PRICING_CENTS } from '../usage/usage-pricing';
import { serializeUsageEvent } from '../usage/usage.serializer';
import {
  serializeBillingAllowanceGrant,
  serializeBillingBalance,
  serializeBillingSubscription,
  serializeBillingTransaction,
} from './billing.serializer';
import { StripeClientService, type StripeWebhookEvent } from './stripe-client.service';

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

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeClientService,
    private readonly audit: AuditService,
  ) {}

  async getBalance(context: RequestContext) {
    const balance = await this.findOrCreateWorkspaceBalance(context.workspaceId);
    return serializeBillingBalance(balance);
  }

  getPricing() {
    return {
      currency: 'USD',
      plans: this.getPlans(),
      rates: [
        {
          key: 'phone_number_provision',
          resourceType: 'phone_number',
          channel: 'number',
          unit: 'number',
          unitCostCents: USAGE_PRICING_CENTS.phoneNumberProvision,
          formula: 'quantity * phone_number_provision',
        },
        {
          key: 'sms_outbound',
          resourceType: 'message',
          channel: 'sms.outbound',
          unit: 'message',
          unitCostCents: USAGE_PRICING_CENTS.outboundSms,
          formula: 'outbound_messages * sms_outbound',
        },
        {
          key: 'sms_inbound',
          resourceType: 'message',
          channel: 'sms.inbound',
          unit: 'message',
          unitCostCents: USAGE_PRICING_CENTS.inboundSms,
          formula: 'inbound_messages * sms_inbound',
        },
        {
          key: 'voice_minute',
          resourceType: 'call',
          channel: 'voice',
          unit: 'minute',
          unitCostCents: USAGE_PRICING_CENTS.voiceMinute,
          formula: 'ceil(duration_seconds / 60) * voice_minute',
        },
      ],
      billingRules: {
        currencyPrecision: 'Costs are stored as USD decimals and debited as whole cents.',
        voiceMinimum: 'Voice calls have a 1 billable minute minimum.',
        voiceRounding: 'Voice duration is rounded up to the next full minute.',
        smsUnits: 'Each inbound or outbound SMS message is 1 billable message unit.',
        numberUnits:
          'Each provisioned/imported number records 1 number unit when AgentLine takes ownership.',
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
    const [subscription, allowanceGrants] = await Promise.all([
      this.prisma.billingSubscription.findFirst({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.billingAllowanceGrant.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

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

  async createSignupBillingState(workspaceId: string) {
    const account = await this.findOrCreateStripeBillingAccount(workspaceId);
    const existingTrial = await this.prisma.billingAllowanceGrant.findFirst({
      where: {
        workspaceId,
        source: 'trial',
      },
    });

    if (!existingTrial) {
      const trialPlan = this.findPlan('free');
      const now = new Date();
      await this.prisma.billingAllowanceGrant.create({
        data: {
          id: createId('balg'),
          workspaceId,
          source: 'trial',
          amountCents: trialPlan.includedUsageCents,
          currency: 'USD',
          periodStart: now,
          periodEnd: new Date(now.getTime() + trialPlan.trialDays * 24 * 60 * 60 * 1000),
          expiresAt: new Date(now.getTime() + trialPlan.trialDays * 24 * 60 * 60 * 1000),
          metadata: {
            planKey: trialPlan.key,
            providerCustomerId: account.providerCustomerId,
          } as Prisma.InputJsonValue,
        },
      });
    }

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
      action: 'billing.controls_updated',
      resourceType: 'billing_balance',
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
      pricing: this.getPricing(),
    };
  }

  getStripeStatus() {
    return this.stripe.getConfigurationStatus();
  }

  async debitWorkspace(workspaceId: string, cents: number) {
    if (cents <= 0) {
      return this.findOrCreateWorkspaceBalance(workspaceId);
    }

    const balance = await this.findOrCreateWorkspaceBalance(workspaceId);

    if (balance.spendLimitCents !== null) {
      const spentCents = await this.getWorkspaceSpentCents(workspaceId);
      if (spentCents + cents > balance.spendLimitCents) {
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

    const result = await this.prisma.billingBalance.updateMany({
      where: {
        workspaceId,
        balanceCents: { gte: cents },
      },
      data: {
        balanceCents: { decrement: cents },
      },
    });

    if (result.count !== 1) {
      throw new ApiException('insufficient_balance', 'Usage exceeds workspace spend limit.', 402, {
        cents,
        balanceCents: balance.balanceCents,
      });
    }

    return this.prisma.billingBalance.findUniqueOrThrow({
      where: { workspaceId },
    });
  }

  async creditWorkspace(workspaceId: string, cents: number) {
    await this.findOrCreateWorkspaceBalance(workspaceId);
    return this.prisma.billingBalance.update({
      where: { workspaceId },
      data: { balanceCents: { increment: cents } },
    });
  }

  async settleUsageCharge(input: {
    workspaceId: string;
    cents: number;
    occurredAt?: Date;
  }): Promise<UsageSettlementResult> {
    if (input.cents <= 0) {
      return {
        settlementMode: UsageSettlementMode.prepaid_balance,
        settlementStatus: 'internal_debited',
        allowanceGrantId: null,
        evidence: { settlementReason: 'zero_cost' },
      };
    }

    const allowance = await this.consumeAllowanceGrant({
      workspaceId: input.workspaceId,
      cents: input.cents,
      occurredAt: input.occurredAt ?? new Date(),
    });

    if (allowance) {
      return allowance;
    }

    const subscription = await this.prisma.billingSubscription.findFirst({
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
        allowanceGrantId: null,
        evidence: {
          settlementReason: 'active_subscription_metered_overage',
          subscriptionId: subscription.id,
          providerSubscriptionId: subscription.providerSubscriptionId,
          planKey: subscription.planKey,
        },
      };
    }

    await this.debitWorkspace(input.workspaceId, input.cents);
    return {
      settlementMode: UsageSettlementMode.prepaid_balance,
      settlementStatus: 'internal_debited',
      allowanceGrantId: null,
      evidence: { settlementReason: 'prepaid_balance' },
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

    if (deltaCents < 0) {
      const refundCents = Math.abs(deltaCents);
      if (event.allowanceGrantId) {
        await this.prisma.billingAllowanceGrant.update({
          where: { id: event.allowanceGrantId },
          data: { consumedCents: { decrement: refundCents } },
        });
        return {
          settlementMode: event.settlementMode,
          allowanceGrantId: event.allowanceGrantId,
          evidence: {
            settlementReason: 'allowance_refund',
            allowanceGrantId: event.allowanceGrantId,
            refundCents,
          },
        };
      }

      if (event.settlementMode === UsageSettlementMode.prepaid_balance) {
        await this.creditWorkspace(event.workspaceId, refundCents);
      }

      return {
        settlementMode: event.settlementMode,
        allowanceGrantId: event.allowanceGrantId,
        evidence: { settlementReason: 'settlement_refund', refundCents },
      };
    }

    if (event.allowanceGrantId) {
      const grant = await this.prisma.billingAllowanceGrant.findUnique({
        where: { id: event.allowanceGrantId },
      });
      if (grant && grant.amountCents - grant.consumedCents >= deltaCents) {
        await this.prisma.billingAllowanceGrant.updateMany({
          where: {
            id: grant.id,
            consumedCents: { lte: grant.amountCents - deltaCents },
          },
          data: { consumedCents: { increment: deltaCents } },
        });
        return {
          settlementMode: event.settlementMode,
          allowanceGrantId: event.allowanceGrantId,
          evidence: {
            settlementReason: 'allowance_delta',
            allowanceGrantId: event.allowanceGrantId,
            deltaCents,
          },
        };
      }
    }

    if (event.settlementMode === UsageSettlementMode.stripe_meter) {
      return {
        settlementMode: UsageSettlementMode.stripe_meter,
        allowanceGrantId: null,
        evidence: { settlementReason: 'stripe_meter_delta', deltaCents },
      };
    }

    return this.settleUsageCharge({
      workspaceId: event.workspaceId,
      cents: deltaCents,
      occurredAt: event.occurredAt,
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

    return list(transactions.map(serializeBillingTransaction), { limit, nextCursor: null });
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
    const event = this.stripe.constructWebhookEvent(rawBody, signature);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
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

        if (event.type.startsWith('customer.subscription.')) {
          const handled = await this.handleSubscriptionEvent(tx, event);
          return { received: true, duplicate: false, ignored: !handled };
        }

        if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
          const handled = await this.handleInvoiceEvent(tx, event);
          return { received: true, duplicate: false, ignored: !handled };
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

      return result;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return { received: true, duplicate: true, ignored: false };
      }

      throw error;
    }
  }

  private async getWorkspaceSpentCents(workspaceId: string) {
    const aggregate = await this.prisma.usageEvent.aggregate({
      where: { workspaceId, settlementStatus: { not: 'voided' } },
      _sum: { totalCost: true },
    });
    const totalCost = aggregate._sum.totalCost;

    if (!totalCost) {
      return 0;
    }

    return Math.round(totalCost.toNumber() * 100);
  }

  private async consumeAllowanceGrant(input: {
    workspaceId: string;
    cents: number;
    occurredAt: Date;
  }): Promise<UsageSettlementResult | null> {
    const grants = await this.prisma.billingAllowanceGrant.findMany({
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

    for (const grant of grants) {
      const remainingCents = grant.amountCents - grant.consumedCents;
      if (remainingCents < input.cents) {
        continue;
      }

      const result = await this.prisma.billingAllowanceGrant.updateMany({
        where: {
          id: grant.id,
          consumedCents: { lte: grant.amountCents - input.cents },
        },
        data: { consumedCents: { increment: input.cents } },
      });

      if (result.count !== 1) {
        continue;
      }

      return {
        settlementMode:
          grant.source === BillingAllowanceSource.trial
            ? UsageSettlementMode.trial_allowance
            : UsageSettlementMode.included_allowance,
        settlementStatus: 'internal_debited',
        allowanceGrantId: grant.id,
        evidence: {
          settlementReason:
            grant.source === BillingAllowanceSource.trial
              ? 'trial_allowance'
              : 'subscription_included_allowance',
          allowanceGrantId: grant.id,
          allowanceSource: grant.source,
          consumedCents: input.cents,
          remainingBeforeCents: remainingCents,
          remainingAfterCents: remainingCents - input.cents,
        },
      };
    }

    return null;
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

  private async findOrCreateWorkspaceBalance(workspaceId: string) {
    const existing = await this.prisma.billingBalance.findUnique({
      where: { workspaceId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.billingBalance.create({
      data: {
        id: createId('bal'),
        workspaceId,
        currency: 'USD',
        balanceCents: 500,
      },
    });
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

    return this.prisma.billingAccount.create({
      data: {
        id: createId('bacc'),
        workspaceId,
        provider: 'stripe',
        providerCustomerId: customer.id,
        status: 'active',
        defaultCurrency: 'USD',
      },
    });
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
      return;
    }

    const amountCents = this.amountCentsFromCheckoutSession(stripeObject);
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

    return true;
  }

  private async handleInvoiceEvent(tx: Prisma.TransactionClient, event: StripeWebhookEvent) {
    const stripeObject = event.data.object;
    const workspaceId = await this.workspaceIdFromEventOrCustomer(tx, event);

    if (!workspaceId) {
      return false;
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

    if (event.type !== 'invoice.paid') {
      return true;
    }

    const subscription = await this.findSubscriptionForStripeObject(tx, workspaceId, stripeObject);
    if (!subscription) {
      return true;
    }

    const plan = this.findPlan(subscription.planKey as BillingPlanKey);
    if (plan.includedUsageCents <= 0) {
      return true;
    }

    const periodStart = this.dateFromUnix(stripeObject.period_start);
    const periodEnd = this.dateFromUnix(stripeObject.period_end);
    await tx.billingAllowanceGrant.create({
      data: {
        id: createId('balg'),
        workspaceId,
        subscriptionId: subscription.id,
        source: 'subscription_included',
        amountCents: plan.includedUsageCents,
        currency: String(stripeObject.currency ?? 'usd').toUpperCase(),
        periodStart,
        periodEnd,
        expiresAt: periodEnd,
        metadata: {
          invoiceId: stripeObject.id,
          planKey: plan.key,
          providerSubscriptionId: subscription.providerSubscriptionId,
        } as Prisma.InputJsonValue,
      },
    });

    return true;
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
