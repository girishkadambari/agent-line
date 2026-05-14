import type { UsageEvent } from '@prisma/client';

export function serializeUsageEvent(event: UsageEvent) {
  const eventWithExpansionFields = event as UsageEvent & {
    billableQuantity?: UsageEvent['quantity'];
    pricingVersion?: string;
    calculation?: unknown;
    evidence?: unknown;
    settlementStatus?: string;
    stripeMeterEventId?: string | null;
  };

  return {
    id: event.id,
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    agentId: event.agentId,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    channel: event.channel,
    quantity: event.quantity.toString(),
    billableQuantity: (eventWithExpansionFields.billableQuantity ?? event.quantity).toString(),
    unit: event.unit,
    unitCost: event.unitCost.toString(),
    totalCost: event.totalCost.toString(),
    pricingVersion: eventWithExpansionFields.pricingVersion ?? 'unknown',
    calculation: eventWithExpansionFields.calculation ?? {},
    evidence: eventWithExpansionFields.evidence ?? {},
    settlementStatus: eventWithExpansionFields.settlementStatus ?? 'internal_debited',
    stripeMeterEventId: eventWithExpansionFields.stripeMeterEventId ?? null,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}

export function serializeUsageRollup(input: {
  period: string;
  quantity: string;
  totalCost: string;
}) {
  return input;
}
