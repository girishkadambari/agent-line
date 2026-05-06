import type { APIKey } from '@prisma/client';

export function serializeApiKey(apiKey: APIKey) {
  return {
    id: apiKey.id,
    workspaceId: apiKey.workspaceId,
    projectId: apiKey.projectId,
    label: apiKey.label,
    prefix: apiKey.prefix,
    status: apiKey.status,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
    updatedAt: apiKey.updatedAt.toISOString(),
  };
}

export function serializeCreatedApiKey(apiKey: APIKey, rawKey: string) {
  return {
    ...serializeApiKey(apiKey),
    key: rawKey,
  };
}
