import type { BillingBalance } from '@prisma/client';

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
