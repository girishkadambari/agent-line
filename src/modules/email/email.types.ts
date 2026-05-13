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
