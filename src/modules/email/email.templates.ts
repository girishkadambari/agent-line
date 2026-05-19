import type { RenderedEmail } from './email.types';

export function renderWorkspaceInviteEmail(input: {
  dashboardUrl: string;
  workspaceName: string;
  role: string;
  token: string;
}): RenderedEmail {
  const inviteUrl = buildInviteUrl(input.dashboardUrl, input.token);
  const subject = `Join ${input.workspaceName} on Vukho`;
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
      `<p>You have been invited to Vukho as <strong>${escapedRole}</strong>.</p>`,
      `<p><a href="${escapedInviteUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px">Accept invite</a></p>`,
      `<p style="color:#666;font-size:13px">If the button does not work, open this link: ${escapedInviteUrl}</p>`,
      '</body>',
      '</html>',
    ].join(''),
    text: [
      `Join ${input.workspaceName} on Vukho`,
      '',
      `Role: ${input.role}`,
      `Accept invite: ${inviteUrl}`,
    ].join('\n'),
  };
}

export function renderWorkspaceBillingAlertEmail(input: {
  dashboardUrl: string;
  workspaceName: string;
  kind: 'low_balance' | 'spend_limit_reached' | 'payment_failed';
  amountCents?: number;
  balanceCents?: number;
  spendLimitCents?: number;
  invoiceId?: string;
}): RenderedEmail {
  const dashboardUrl = input.dashboardUrl.replace(/\/$/, '');
  const billingUrl = `${dashboardUrl}/billing`;
  const escapedWorkspaceName = escapeHtml(input.workspaceName);
  const escapedBillingUrl = escapeHtml(billingUrl);
  const content = billingAlertContent(input);

  return {
    subject: content.subject,
    html: [
      '<!doctype html>',
      '<html>',
      '<body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">',
      `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(content.heading)}</h1>`,
      `<p>${escapeHtml(content.body)}</p>`,
      `<p style="color:#666;font-size:13px">Workspace: ${escapedWorkspaceName}</p>`,
      `<p><a href="${escapedBillingUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px">Open billing</a></p>`,
      `<p style="color:#666;font-size:13px">If the button does not work, open this link: ${escapedBillingUrl}</p>`,
      '</body>',
      '</html>',
    ].join(''),
    text: [
      content.heading,
      '',
      content.body,
      '',
      `Workspace: ${input.workspaceName}`,
      `Open billing: ${billingUrl}`,
    ].join('\n'),
  };
}

export function renderWorkspaceTeamEventEmail(input: {
  dashboardUrl: string;
  workspaceName: string;
  kind: 'invite_accepted' | 'invite_revoked';
  inviteEmail: string;
  role: string;
}): RenderedEmail {
  const dashboardUrl = input.dashboardUrl.replace(/\/$/, '');
  const membersUrl = `${dashboardUrl}/settings`;
  const escapedWorkspaceName = escapeHtml(input.workspaceName);
  const escapedMembersUrl = escapeHtml(membersUrl);
  const escapedInviteEmail = escapeHtml(input.inviteEmail);
  const escapedRole = escapeHtml(input.role);
  const content =
    input.kind === 'invite_accepted'
      ? {
          subject: `Invite accepted for ${input.workspaceName}`,
          heading: 'Invite accepted',
          body: `${input.inviteEmail} joined ${input.workspaceName} as ${input.role}.`,
        }
      : {
          subject: `Invite revoked for ${input.workspaceName}`,
          heading: 'Invite revoked',
          body: `The invite for ${input.inviteEmail} to join ${input.workspaceName} as ${input.role} was revoked.`,
        };

  return {
    subject: content.subject,
    html: [
      '<!doctype html>',
      '<html>',
      '<body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">',
      `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(content.heading)}</h1>`,
      `<p>${escapeHtml(content.body)}</p>`,
      `<p style="color:#666;font-size:13px">Workspace: ${escapedWorkspaceName}</p>`,
      `<p style="color:#666;font-size:13px">Member: ${escapedInviteEmail} · Role: ${escapedRole}</p>`,
      `<p><a href="${escapedMembersUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px">Open workspace settings</a></p>`,
      `<p style="color:#666;font-size:13px">If the button does not work, open this link: ${escapedMembersUrl}</p>`,
      '</body>',
      '</html>',
    ].join(''),
    text: [
      content.heading,
      '',
      content.body,
      '',
      `Workspace: ${input.workspaceName}`,
      `Member: ${input.inviteEmail}`,
      `Role: ${input.role}`,
      `Open workspace settings: ${membersUrl}`,
    ].join('\n'),
  };
}

function billingAlertContent(input: {
  kind: 'low_balance' | 'spend_limit_reached' | 'payment_failed';
  amountCents?: number;
  balanceCents?: number;
  spendLimitCents?: number;
  invoiceId?: string;
}) {
  if (input.kind === 'payment_failed') {
    return {
      subject: 'Vukho payment needs attention',
      heading: 'Payment needs attention',
      body: `An invoice payment failed${input.invoiceId ? ` for invoice ${input.invoiceId}` : ''}. Update the payment method to keep Vukho actions running.`,
    };
  }

  if (input.kind === 'spend_limit_reached') {
    return {
      subject: 'Vukho spend limit reached',
      heading: 'Spend limit reached',
      body: `A billable Vukho action was blocked because the workspace reached its monthly spend limit of ${formatUsd(input.spendLimitCents ?? 0)}.`,
    };
  }

  return {
    subject: 'Vukho balance is low',
    heading: 'Balance is low',
    body: `Your Vukho available balance is ${formatUsd(input.balanceCents ?? 0)}. Add credits to avoid blocked SMS, calls, or number actions.`,
  };
}

function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
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
