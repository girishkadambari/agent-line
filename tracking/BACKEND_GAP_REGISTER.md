# AgentLine Backend Gap Register

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

Remaining:

- Invite email delivery.
- Full role-based authorization enforcement.

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

### Dashboard Summary Endpoint

Priority: P2

Needed:

- One API response for overview totals, recent calls, recent conversations,
  usage, balance, and health state.

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
