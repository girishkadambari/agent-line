import type { UsageEvent } from '@prisma/client';

export function serializeUsageEvent(event: UsageEvent) {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    agentId: event.agentId,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    channel: event.channel,
    quantity: event.quantity.toString(),
    unit: event.unit,
    unitCost: event.unitCost.toString(),
    totalCost: event.totalCost.toString(),
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
