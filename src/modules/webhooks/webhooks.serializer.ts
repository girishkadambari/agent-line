import type { WebhookDelivery, WebhookEndpoint } from '@prisma/client';

export function serializeWebhookEndpoint(endpoint: WebhookEndpoint) {
  return {
    id: endpoint.id,
    workspaceId: endpoint.workspaceId,
    projectId: endpoint.projectId,
    url: endpoint.url,
    events: endpoint.events,
    status: endpoint.status,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

export function serializeWebhookEndpointWithSecret(endpoint: WebhookEndpoint) {
  return {
    ...serializeWebhookEndpoint(endpoint),
    secret: endpoint.secret,
  };
}

export function serializeWebhookDelivery(delivery: WebhookDelivery) {
  return {
    id: delivery.id,
    workspaceId: delivery.workspaceId,
    projectId: delivery.projectId,
    endpointId: delivery.endpointId,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    payload: delivery.payload,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    lastStatusCode: delivery.lastStatusCode,
    lastError: delivery.lastError,
    nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}
