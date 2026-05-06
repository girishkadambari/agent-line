import type { InternalEvent } from '@prisma/client';

export function serializeInternalEvent(event: InternalEvent) {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    type: event.type,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
  };
}
