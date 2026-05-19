import type { APIKey, AuditEvent, User } from '@prisma/client';

export type AuditEventActorType = 'user' | 'api_key' | 'system';

export interface AuditActorView {
  type: AuditEventActorType;
  name: string | null;
  email: string | null;
  apiKeyLabel: string | null;
  apiKeyPrefix: string | null;
  displayName: string;
  detail: string | null;
}

type AuditEventWithActor = AuditEvent & {
  actorUser?: Pick<User, 'id' | 'name' | 'email'> | null;
};

function buildActor(
  event: AuditEventWithActor,
  apiKey?: Pick<APIKey, 'id' | 'label' | 'prefix'>,
): AuditActorView {
  if (event.actorUser) {
    const displayName = event.actorUser.name || event.actorUser.email || 'Workspace member';
    return {
      type: 'user',
      name: event.actorUser.name,
      email: event.actorUser.email,
      apiKeyLabel: null,
      apiKeyPrefix: null,
      displayName,
      detail:
        event.actorUser.email && event.actorUser.email !== displayName
          ? event.actorUser.email
          : null,
    };
  }

  if (apiKey) {
    const displayName = apiKey.label || apiKey.prefix || 'API key';
    return {
      type: 'api_key',
      name: null,
      email: null,
      apiKeyLabel: apiKey.label,
      apiKeyPrefix: apiKey.prefix,
      displayName,
      detail: apiKey.prefix ? `API key prefix ${apiKey.prefix}` : null,
    };
  }

  return {
    type: 'system',
    name: null,
    email: null,
    apiKeyLabel: null,
    apiKeyPrefix: null,
    displayName: 'Vukho automation',
    detail: 'System generated',
  };
}

const actionLabels: Record<string, string> = {
  'auth.login': 'Signed in',
  'workspace.created': 'Workspace created',
  'workspace.updated': 'Workspace updated',
  'workspace.switched': 'Workspace switched',
  'member.role_updated': 'Member role updated',
  'member.removed': 'Member removed',
  'invite.created': 'Invite created',
  'invite.revoked': 'Invite revoked',
  'invite.resent': 'Invite resent',
  'invite.accepted': 'Invite accepted',
  'invite.expired': 'Invite expired',
  'api_key.created': 'API key created',
  'api_key.updated': 'API key updated',
  'api_key.revoked': 'API key revoked',
  'api_key.rotated': 'API key rotated',
  'billing.controls_updated': 'Billing controls updated',
  'billing.credit_applied': 'Credit applied',
  'billing.checkout_expired': 'Checkout expired',
  'billing.subscription_synced': 'Subscription synced',
  'billing.invoice_paid': 'Invoice paid',
  'billing.invoice_payment_failed': 'Invoice payment failed',
  'call.created': 'Call started',
  'call.failed': 'Call failed',
  'call.ended': 'Call ended',
  'call.transferred': 'Call transferred',
  'number.provisioned': 'Number provisioned',
  'number.imported': 'Number imported',
  'number.attached': 'Number attached',
  'number.detached': 'Number detached',
  'number.released': 'Number released',
  'webhook_endpoint.created': 'Webhook endpoint created',
  'webhook_endpoint.updated': 'Webhook endpoint updated',
  'webhook_endpoint.disabled': 'Webhook endpoint disabled',
  'webhook_delivery.tested': 'Webhook delivery tested',
  'webhook_delivery.retried': 'Webhook delivery retried',
  'webhook_delivery.exhausted': 'Webhook delivery exhausted',
};

const resourceLabels: Record<string, string> = {
  agent: 'Agent',
  api_key: 'API key',
  billing_balance: 'Billing balance',
  billing_subscription: 'Subscription',
  billing_transaction: 'Billing transaction',
  call: 'Call',
  contact: 'Contact',
  conversation: 'Conversation',
  message: 'Message',
  phone_number: 'Phone number',
  usage_event: 'Usage event',
  user_session: 'User session',
  webhook_endpoint: 'Webhook endpoint',
  webhook_delivery: 'Webhook delivery',
  workspace: 'Workspace',
  workspace_invite: 'Invite',
  workspace_member: 'Member',
};

const summaryPriority = [
  'email',
  'role',
  'name',
  'status',
  'planKey',
  'amountCents',
  'spendLimitCents',
  'phoneNumber',
  'to',
  'from',
];

export function serializeAuditEvent(
  event: AuditEventWithActor,
  apiKey?: Pick<APIKey, 'id' | 'label' | 'prefix'>,
) {
  const actor = buildActor(event, apiKey);
  const actionLabel = actionLabels[event.action] ?? titleize(event.action);
  const resourceLabel = resourceLabels[event.resourceType] ?? titleize(event.resourceType);
  const metadata = asMetadataRecord(event.metadata);

  return {
    id: event.id,
    workspaceId: event.workspaceId,
    actorUserId: event.actorUserId,
    actorApiKeyId: event.actorApiKeyId,
    actor,
    action: event.action,
    display: {
      actionLabel,
      actorLabel: actor.displayName,
      actorDetail: actor.detail,
      category: categoryFromAction(event.action),
      resourceLabel,
      summary: metadataSummary(metadata),
    },
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    metadata,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    createdAt: event.createdAt.toISOString(),
  };
}

function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function categoryFromAction(action: string) {
  return action.split('.')[0] || 'activity';
}

function metadataSummary(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== null && value !== undefined,
  );
  if (entries.length === 0) {
    return 'No extra details captured.';
  }

  const selected = summaryPriority
    .flatMap((key) => {
      if (!(key in metadata) || metadata[key] === null || metadata[key] === undefined) {
        return [];
      }

      return `${titleize(key)}: ${formatMetadataValue(key, metadata[key])}`;
    })
    .slice(0, 3);

  if (selected.length > 0) {
    return selected.join(' · ');
  }

  return `${entries.length} detail${entries.length === 1 ? '' : 's'} captured.`;
}

function formatMetadataValue(key: string, value: unknown) {
  if (key.toLowerCase().endsWith('cents')) {
    const cents = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(cents)) {
      return `$${(cents / 100).toFixed(2)}`;
    }
  }

  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function titleize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
