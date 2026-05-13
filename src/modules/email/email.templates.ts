import type { RenderedEmail } from './email.types';

export function renderWorkspaceInviteEmail(input: {
  dashboardUrl: string;
  workspaceName: string;
  role: string;
  token: string;
}): RenderedEmail {
  const inviteUrl = buildInviteUrl(input.dashboardUrl, input.token);
  const subject = `Join ${input.workspaceName} on AgentLine`;
  const escapedWorkspaceName = escapeHtml(input.workspaceName);
  const escapedRole = escapeHtml(input.role);
  const escapedInviteUrl = escapeHtml(inviteUrl);

  return {
    subject,
    html: [
      '<!doctype html>',
      '<html>',
      '<body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">',
      `<h1 style="font-size:20px;margin:0 0 16px">Join ${escapedWorkspaceName}</h1>`,
      `<p>You have been invited to AgentLine as <strong>${escapedRole}</strong>.</p>`,
      `<p><a href="${escapedInviteUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px">Accept invite</a></p>`,
      `<p style="color:#666;font-size:13px">If the button does not work, open this link: ${escapedInviteUrl}</p>`,
      '</body>',
      '</html>',
    ].join(''),
    text: [`Join ${input.workspaceName} on AgentLine`, '', `Role: ${input.role}`, `Accept invite: ${inviteUrl}`].join(
      '\n',
    ),
  };
}

function buildInviteUrl(dashboardUrl: string, token: string) {
  const baseUrl = dashboardUrl.replace(/\/$/, '');
  return `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
