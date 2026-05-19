export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult = {
  providerMessageId?: string;
};

export type WorkspaceInviteEmailInput = {
  workspaceId: string;
  inviteId: string;
  email: string;
  role: string;
  rawToken: string;
};

export type WorkspaceBillingAlertEmailInput = {
  workspaceId: string;
  kind: 'low_balance' | 'spend_limit_reached' | 'payment_failed';
  amountCents?: number;
  balanceCents?: number;
  spendLimitCents?: number;
  invoiceId?: string;
  idempotencyScope: string;
};

export type WorkspaceTeamEventEmailInput = {
  workspaceId: string;
  inviteId: string;
  inviteEmail: string;
  role: string;
  kind: 'invite_accepted' | 'invite_revoked';
  idempotencyScope: string;
};
