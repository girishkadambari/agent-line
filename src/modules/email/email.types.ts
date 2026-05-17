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

export type InviteAcceptedEmailInput = {
  workspaceId: string;
  inviteId: string;
  email: string;
  role: string;
  workspaceName: string;
};

export type InviteRevokedEmailInput = {
  workspaceId: string;
  inviteId: string;
  email: string;
  workspaceName: string;
};

export type ApiKeySecurityEmailInput = {
  workspaceId: string;
  apiKeyId: string;
  email: string;
  workspaceName: string;
  label: string;
  prefix: string;
  action: 'created' | 'revoked' | 'rotated';
  newPrefix?: string;
};
