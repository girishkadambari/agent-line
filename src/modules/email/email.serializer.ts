import type { EmailDelivery } from '@prisma/client';

export function serializeEmailDelivery(delivery: EmailDelivery) {
  return {
    id: delivery.id,
    workspaceId: delivery.workspaceId,
    recipientEmail: delivery.recipientEmail,
    template: delivery.template,
    subject: delivery.subject,
    status: delivery.status,
    provider: delivery.provider,
    providerMessageId: delivery.providerMessageId,
    metadata: delivery.metadata,
    errorCode: delivery.errorCode,
    errorMessage: delivery.errorMessage,
    sentAt: delivery.sentAt?.toISOString() ?? null,
    failedAt: delivery.failedAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}
