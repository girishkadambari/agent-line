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
    text: [
      `Join ${input.workspaceName} on AgentLine`,
      '',
      `Role: ${input.role}`,
      `Accept invite: ${inviteUrl}`,
    ].join('\n'),
  };
}

export function renderInviteAcceptedEmail(input: {
  workspaceName: string;
  email: string;
  role: string;
}): RenderedEmail {
  const subject = `${escapeHtml(input.email)} joined ${escapeHtml(input.workspaceName)}`;
  const escapedWorkspaceName = escapeHtml(input.workspaceName);
  const escapedEmail = escapeHtml(input.email);
  const escapedRole = escapeHtml(input.role);

  return {
    subject,
    html: [
      '<!doctype html>',
      '<html>',
      '<body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">',
      `<h1 style="font-size:20px;margin:0 0 16px">New member joined ${escapedWorkspaceName}</h1>`,
      `<p><strong>${escapedEmail}</strong> has accepted the invite and joined as <strong>${escapedRole}</strong>.</p>`,
      '</body>',
      '</html>',
    ].join(''),
    text: [
      `New member joined ${input.workspaceName}`,
      '',
      `${input.email} joined as ${input.role}.`,
    ].join('\n'),
  };
}

export function renderInviteRevokedEmail(input: { workspaceName: string }): RenderedEmail {
  const escapedWorkspaceName = escapeHtml(input.workspaceName);
  const subject = `Your invite to ${input.workspaceName} was revoked`;

  return {
    subject,
    html: [
      '<!doctype html>',
      '<html>',
      '<body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">',
      `<h1 style="font-size:20px;margin:0 0 16px">Invite revoked</h1>`,
      `<p>Your invite to join <strong>${escapedWorkspaceName}</strong> on AgentLine has been revoked.</p>`,
      `<p style="color:#666;font-size:13px">If you believe this is an error, contact the workspace owner.</p>`,
      '</body>',
      '</html>',
    ].join(''),
    text: [
      `Your invite to ${input.workspaceName} was revoked`,
      '',
      'Your invite to join AgentLine has been revoked.',
      'If you believe this is an error, contact the workspace owner.',
    ].join('\n'),
  };
}

export function renderApiKeyCreatedEmail(input: {
  workspaceName: string;
  label: string;
  prefix: string;
}): RenderedEmail {
  const escapedWorkspaceName = escapeHtml(input.workspaceName);
  const escapedLabel = escapeHtml(input.label);
  const escapedPrefix = escapeHtml(input.prefix);
  const subject = `New API key created — ${input.workspaceName}`;

  return {
    subject,
    html: [
      '<!doctype html>',
      '<html>',
      '<body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">',
      `<h1 style="font-size:20px;margin:0 0 16px">New API key created</h1>`,
      `<p>A new API key was created for <strong>${escapedWorkspaceName}</strong>.</p>`,
      `<table style="border-collapse:collapse;margin:12px 0;font-size:13px">`,
      `<tr><td style="padding:4px 12px 4px 0;color:#666">Label</td><td style="padding:4px 0"><strong>${escapedLabel}</strong></td></tr>`,
      `<tr><td style="padding:4px 12px 4px 0;color:#666">Prefix</td><td style="padding:4px 0"><code>${escapedPrefix}</code></td></tr>`,
      `</table>`,
      `<p style="color:#666;font-size:13px">If you did not create this key, revoke it immediately from the API Keys page and contact support.</p>`,
      '</body>',
      '</html>',
    ].join(''),
    text: [
      `New API key created — ${input.workspaceName}`,
      '',
      `Label: ${input.label}`,
      `Prefix: ${input.prefix}`,
      '',
      'If you did not create this key, revoke it immediately from the API Keys page.',
    ].join('\n'),
  };
}

export function renderApiKeyRevokedEmail(input: {
  workspaceName: string;
  label: string;
  prefix: string;
}): RenderedEmail {
  const escapedWorkspaceName = escapeHtml(input.workspaceName);
  const escapedLabel = escapeHtml(input.label);
  const escapedPrefix = escapeHtml(input.prefix);
  const subject = `API key revoked — ${input.workspaceName}`;

  return {
    subject,
    html: [
      '<!doctype html>',
      '<html>',
      '<body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">',
      `<h1 style="font-size:20px;margin:0 0 16px">API key revoked</h1>`,
      `<p>An API key for <strong>${escapedWorkspaceName}</strong> was revoked and can no longer be used.</p>`,
      `<table style="border-collapse:collapse;margin:12px 0;font-size:13px">`,
      `<tr><td style="padding:4px 12px 4px 0;color:#666">Label</td><td style="padding:4px 0"><strong>${escapedLabel}</strong></td></tr>`,
      `<tr><td style="padding:4px 12px 4px 0;color:#666">Prefix</td><td style="padding:4px 0"><code>${escapedPrefix}</code></td></tr>`,
      `</table>`,
      `<p style="color:#666;font-size:13px">If you did not revoke this key, contact your workspace owner.</p>`,
      '</body>',
      '</html>',
    ].join(''),
    text: [
      `API key revoked — ${input.workspaceName}`,
      '',
      `Label: ${input.label}`,
      `Prefix: ${input.prefix}`,
      '',
      'If you did not revoke this key, contact your workspace owner.',
    ].join('\n'),
  };
}

export function renderApiKeyRotatedEmail(input: {
  workspaceName: string;
  label: string;
  newPrefix: string;
}): RenderedEmail {
  const escapedWorkspaceName = escapeHtml(input.workspaceName);
  const escapedLabel = escapeHtml(input.label);
  const escapedNewPrefix = escapeHtml(input.newPrefix);
  const subject = `API key rotated — ${input.workspaceName}`;

  return {
    subject,
    html: [
      '<!doctype html>',
      '<html>',
      '<body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">',
      `<h1 style="font-size:20px;margin:0 0 16px">API key rotated</h1>`,
      `<p>An API key for <strong>${escapedWorkspaceName}</strong> was rotated. The old key is now invalid.</p>`,
      `<table style="border-collapse:collapse;margin:12px 0;font-size:13px">`,
      `<tr><td style="padding:4px 12px 4px 0;color:#666">Label</td><td style="padding:4px 0"><strong>${escapedLabel}</strong></td></tr>`,
      `<tr><td style="padding:4px 12px 4px 0;color:#666">New prefix</td><td style="padding:4px 0"><code>${escapedNewPrefix}</code></td></tr>`,
      `</table>`,
      `<p style="color:#666;font-size:13px">If you did not rotate this key, revoke it immediately and contact support.</p>`,
      '</body>',
      '</html>',
    ].join(''),
    text: [
      `API key rotated — ${input.workspaceName}`,
      '',
      `Label: ${input.label}`,
      `New prefix: ${input.newPrefix}`,
      '',
      'If you did not rotate this key, revoke it immediately from the API Keys page.',
    ].join('\n'),
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
