import type { APIKey, AuditEvent, User } from '@prisma/client';

export type AuditEventActorType = 'user' | 'api_key' | 'system';

export interface AuditActorView {
  type: AuditEventActorType;
  name: string | null;
  email: string | null;
  apiKeyLabel: string | null;
  apiKeyPrefix: string | null;
}

type AuditEventWithActor = AuditEvent & {
  actorUser?: Pick<User, 'id' | 'name' | 'email'> | null;
};

function buildActor(
  event: AuditEventWithActor,
  apiKey?: Pick<APIKey, 'id' | 'label' | 'prefix'>,
): AuditActorView {
  if (event.actorUser) {
    return {
      type: 'user',
      name: event.actorUser.name,
      email: event.actorUser.email,
      apiKeyLabel: null,
      apiKeyPrefix: null,
    };
  }

  if (apiKey) {
    return {
      type: 'api_key',
      name: null,
      email: null,
      apiKeyLabel: apiKey.label,
      apiKeyPrefix: apiKey.prefix,
    };
  }

  return {
    type: 'system',
    name: null,
    email: null,
    apiKeyLabel: null,
    apiKeyPrefix: null,
  };
}

export function serializeAuditEvent(
  event: AuditEventWithActor,
  apiKey?: Pick<APIKey, 'id' | 'label' | 'prefix'>,
) {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    actorUserId: event.actorUserId,
    actorApiKeyId: event.actorApiKeyId,
    actor: buildActor(event, apiKey),
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    metadata: event.metadata,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    createdAt: event.createdAt.toISOString(),
  };
}
