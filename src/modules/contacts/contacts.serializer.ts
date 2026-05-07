import type { Contact } from '@prisma/client';

type ContactWithCounts = Contact & {
  _count?: {
    conversations?: number;
    messages?: number;
    calls?: number;
  };
};

export function serializeContact(contact: ContactWithCounts) {
  return {
    id: contact.id,
    workspaceId: contact.workspaceId,
    projectId: contact.projectId,
    phoneNumber: contact.phoneNumber,
    displayName: contact.displayName,
    metadata: contact.metadata,
    counts: {
      conversations: contact._count?.conversations ?? 0,
      messages: contact._count?.messages ?? 0,
      calls: contact._count?.calls ?? 0,
    },
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}
