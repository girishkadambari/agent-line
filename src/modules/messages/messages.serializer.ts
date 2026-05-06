import type { Message } from '@prisma/client';

export function serializeMessage(message: Message) {
  return {
    id: message.id,
    workspaceId: message.workspaceId,
    projectId: message.projectId,
    agentId: message.agentId,
    conversationId: message.conversationId,
    phoneNumberId: message.phoneNumberId,
    contactId: message.contactId,
    direction: message.direction,
    body: message.body,
    status: message.status,
    provider: message.provider,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}
