# Vukho Backend Gap Register

This file tracks backend gaps that are visible to the dashboard or required
before production beta. Keep this in sync with the frontend gap register.

## Partially Closed

### Workspace Settings

Status: partially closed

Implemented:

- `GET /v1/workspaces/current`
- `PATCH /v1/workspaces/current`

Remaining:

- Workspace serializer does not expose slug, billing email, or onboarding
  completion state.

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
- `EmailDelivery` ledger for sent, failed, and skipped invite emails.
- `GET /v1/email/deliveries`
- Idempotent invite email send keys.

Remaining:

- Invite accepted/revoked notification emails.
- Full role-based authorization enforcement.

### Dashboard Summary Endpoint

Status: closed

Implemented:

- `GET /v1/dashboard/summary`
- Workspace/project counts for agents, active agents, numbers, active numbers,
  conversations, messages, calls, and webhook endpoints.
- Recent calls and recent conversations.
- Daily and monthly usage event/cost totals.
- Billing balance snapshot.
- Safe provider readiness flags for Twilio, Stripe, and Brevo.

Remaining:

- Frontend overview page should switch to this endpoint instead of stitching
  many separate calls.

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

Priority: P2

Needed:

- Safe telecom provider status endpoint.
- Twilio config/callback readiness.
- Provider mode and health with no secret leakage.

### Usage Controls And Compliance Settings

Priority: P2

Needed:

- Editable spend limit endpoint.
- Recording consent controls.
- Data retention controls.
- Audit log viewer.
