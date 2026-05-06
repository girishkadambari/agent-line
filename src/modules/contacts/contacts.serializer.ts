import type { Contact } from '@prisma/client';

export function serializeContact(contact: Contact) {
  return {
    id: contact.id,
    workspaceId: contact.workspaceId,
    projectId: contact.projectId,
    phoneNumber: contact.phoneNumber,
    displayName: contact.displayName,
    metadata: contact.metadata,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}
