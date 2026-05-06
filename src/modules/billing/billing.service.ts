import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type { CreateCheckoutSessionInput, CreatePortalSessionInput } from '../../domain/schemas';
import { PrismaService } from '../prisma/prisma.service';
import { serializeBillingBalance, serializeBillingTransaction } from './billing.serializer';
import { StripeClientService, type StripeWebhookEvent } from './stripe-client.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeClientService,
  ) { }

  async getBalance(context: RequestContext) {
    const balance = await this.findOrCreateWorkspaceBalance(context.workspaceId);
    return serializeBillingBalance(balance);
  }

  async debitWorkspace(workspaceId: string, cents: number) {
    if (cents <= 0) {
      return this.findOrCreateWorkspaceBalance(workspaceId);
    }

    const balance = await this.findOrCreateWorkspaceBalance(workspaceId);

    if (balance.spendLimitCents !== null) {
      const spentCents = await this.getWorkspaceSpentCents(workspaceId);
      if (spentCents + cents > balance.spendLimitCents) {
        throw new ApiException('insufficient_balance', 'Usage exceeds workspace spend limit.', 402, {
          cents,
          spentCents,
          spendLimitCents: balance.spendLimitCents,
        });
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
        } as Prisma.InputJsonValue,
      },
    });

    return {
      id: session.id,
      url: session.url,
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
      where: { workspaceId },
      _sum: { totalCost: true },
    });
    const totalCost = aggregate._sum.totalCost;

    if (!totalCost) {
      return 0;
    }

    return Math.round(totalCost.toNumber() * 100);
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

  private async handleCheckoutCompleted(
    tx: Prisma.TransactionClient,
    event: StripeWebhookEvent,
  ) {
    const stripeObject = event.data.object;
    const workspaceId = this.workspaceIdFromEvent(event);

    if (!workspaceId) {
      throw new ApiException('invalid_request', 'Stripe event is missing workspace id.', 400);
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
        balanceCents: 500 + amountCents,
      },
    });
  }

  private workspaceIdFromEvent(event: StripeWebhookEvent) {
    const stripeObject = event.data.object;
    const metadata = stripeObject.metadata as Record<string, unknown> | undefined;
    return (metadata?.workspaceId ?? stripeObject.client_reference_id) as string | undefined;
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
