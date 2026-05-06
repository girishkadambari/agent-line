import type { BillingBalance, BillingTransaction } from '@prisma/client';

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
