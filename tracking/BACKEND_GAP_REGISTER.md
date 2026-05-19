# Vukho Backend Gap Register

This file tracks backend gaps that are visible to the dashboard or required
before production beta. Keep this in sync with the frontend gap register.

## Closed

### Workspace Settings

Status: closed for production beta

Implemented:

- `GET /v1/workspaces/current`
- `PATCH /v1/workspaces/current`
- `GET /v1/workspaces/current/settings`
- Real workspace/project/member/invite/billing counts.
- Launch readiness derived from live workspace records:
  agent configured, active number attached, webhook configured, ready for live
  traffic, and next setup action.

Notes:

- Slug and billing email are not current schema fields, so they are not part of
  the production beta contract. Billing ownership stays with Stripe customer
  records and workspace membership until custom workspace billing profiles are
  added.

## Partially Closed

### Team Members And Invites

Status: partially closed

Implemented:

- `GET /v1/workspaces/current/members`
- `PATCH /v1/workspaces/current/members/:memberId`
- `DELETE /v1/workspaces/current/members/:memberId`
- `GET /v1/workspaces/current/invites`
- `POST /v1/workspaces/current/invites`
- `DELETE /v1/workspaces/current/invites/:inviteId`
- `POST /v1/workspaces/current/invites/:inviteId/resend`
- Brevo-backed invite email send path.
- Brevo-backed invite accepted/revoked notification emails for workspace
  owners/admins.
- `EmailDelivery` ledger for sent, failed, and skipped invite emails.
- `GET /v1/email/deliveries`
- Idempotent invite email send keys.

Remaining:

- Release smoke with real owner/admin/developer/billing/member sessions to
  verify frontend role behavior.

### Dashboard Summary Endpoint

Status: closed

Implemented:

- `GET /v1/dashboard/summary`
- Workspace/project counts for agents, active agents, numbers, active numbers,
  conversations, messages, calls, and webhook endpoints.
- Recent calls and recent conversations.
- Daily, daily-window, and monthly usage event/cost totals.
- Failed/retrying/exhausted webhook delivery count.
- Billing balance snapshot.
- Safe provider readiness flags for Twilio, Stripe, and Brevo.
- Dashboard overview page reads this endpoint as its source of truth instead of
  stitching many separate calls.

### Twilio Voice Status Callbacks

Status: closed except recording controls

Implemented:

- Outbound Twilio calls register lifecycle callbacks for initiated, ringing,
  answered, and completed status events.
- Twilio call status callbacks are recorded in `ProviderRawEvent`.
- Duplicate callback retries are suppressed before call updates, billing
  settlement, and customer webhook delivery.
- Calls already in a terminal state cannot be regressed by late provider
  callbacks.
- Inbound call creation from Twilio voice webhooks.
- Final billing settlement with explicit adjustment ledger.
- First-class provider status, provider error code, and provider error text on
  call and message records.
- Message/call webhook payloads include normalized provider diagnostics.

Remaining:

- Recording callbacks and recording consent controls.

## Open Gaps

### Real Auth, Google SSO, And User Profile

Priority: P1

Status: backend closed

Needed:

- Frontend Google login/workspace switch integration.

Reason:

- Google OAuth, HTTP-only opaque sessions, current user, workspace
  list/create/switch, invite acceptance, CSRF protection, and initial workspace
  role checks now exist. Dashboard-facing resource APIs now use
  `AuthContextGuard`, so the dashboard can use browser sessions while developer
  automation can continue using API keys. DB-backed OAuth/session e2e tests now
  cover the callback, session cookies, CSRF writes, workspace switching, a
  shared-auth product route, logout, and invalid state rejection.

### Provider Runtime Status

Status: closed

Implemented:

- `GET /v1/health/providers`
- Safe readiness status without exposing provider secrets.
- Phone, billing, and email readiness flags for release checks.
- Release blockers for missing public callback URL, missing callback routes,
  missing Stripe webhook secret, and missing transactional email configuration.
- Customer-facing service health page consumes safe product capability status
  instead of provider-console internals.

### Usage Controls And Compliance Settings

Priority: P2

Needed:

- Recording consent controls before recording support is enabled.
- Editable data retention controls before enterprise usage.
