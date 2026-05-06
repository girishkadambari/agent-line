import type { PhoneNumber } from '@prisma/client';

export function serializeNumber(number: PhoneNumber) {
  return {
    id: number.id,
    workspaceId: number.workspaceId,
    projectId: number.projectId,
    agentId: number.agentId,
    phoneNumber: number.phoneNumber,
    country: number.country,
    areaCode: number.areaCode,
    capabilities: number.capabilities,
    status: number.status,
    provider: number.provider,
    providerNumberId: number.providerNumberId,
    createdAt: number.createdAt.toISOString(),
    updatedAt: number.updatedAt.toISOString(),
  };
}
