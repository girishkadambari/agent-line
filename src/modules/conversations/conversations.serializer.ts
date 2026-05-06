import type { Conversation } from '@prisma/client';

export function serializeConversation(conversation: Conversation) {
  return {
    id: conversation.id,
    workspaceId: conversation.workspaceId,
    projectId: conversation.projectId,
    agentId: conversation.agentId,
    contactId: conversation.contactId,
    channel: conversation.channel,
    status: conversation.status,
    lastActivityAt: conversation.lastActivityAt.toISOString(),
    metadata: conversation.metadata,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}
