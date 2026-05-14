import type {
  BillingAllowanceGrant,
  BillingBalance,
  BillingSubscription,
  BillingTransaction,
} from '@prisma/client';

export function serializeBillingBalance(balance: BillingBalance) {
  return {
    id: balance.id,
    workspaceId: balance.workspaceId,
    currency: balance.currency,
    balanceCents: balance.balanceCents,
    spendLimitCents: balance.spendLimitCents,
    createdAt: balance.createdAt.toISOString(),
    updatedAt: balance.updatedAt.toISOString(),
  };
}

export function serializeBillingTransaction(transaction: BillingTransaction) {
  return {
    id: transaction.id,
    workspaceId: transaction.workspaceId,
    provider: transaction.provider,
    providerEventId: transaction.providerEventId,
    type: transaction.type,
    amountCents: transaction.amountCents,
    currency: transaction.currency,
    status: transaction.status,
    metadata: transaction.metadata,
    createdAt: transaction.createdAt.toISOString(),
  };
}

export function serializeBillingSubscription(subscription: BillingSubscription) {
  return {
    id: subscription.id,
    workspaceId: subscription.workspaceId,
    provider: subscription.provider,
    providerCustomerId: subscription.providerCustomerId,
    providerSubscriptionId: subscription.providerSubscriptionId,
    providerPriceId: subscription.providerPriceId,
    planKey: subscription.planKey,
    status: subscription.status,
    billingMode: subscription.billingMode,
    currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    metadata: subscription.metadata,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  };
}

export function serializeBillingAllowanceGrant(grant: BillingAllowanceGrant) {
  return {
    id: grant.id,
    workspaceId: grant.workspaceId,
    subscriptionId: grant.subscriptionId,
    source: grant.source,
    amountCents: grant.amountCents,
    consumedCents: grant.consumedCents,
    remainingCents: Math.max(grant.amountCents - grant.consumedCents, 0),
    currency: grant.currency,
    periodStart: grant.periodStart?.toISOString() ?? null,
    periodEnd: grant.periodEnd?.toISOString() ?? null,
    expiresAt: grant.expiresAt?.toISOString() ?? null,
    metadata: grant.metadata,
    createdAt: grant.createdAt.toISOString(),
    updatedAt: grant.updatedAt.toISOString(),
  };
}
