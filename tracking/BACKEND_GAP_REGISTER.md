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

Status: partially closed

Needed:

- CSRF protection for session-authenticated mutations.
- Session-or-API-key guard for shared dashboard resource routes.
- Role-based authorization on session-authenticated workspace mutations.
- DB-backed OAuth/session e2e tests with mocked Google responses.

Reason:

- Google OAuth, HTTP-only opaque sessions, current user, workspace
  list/create/switch, and invite acceptance now exist. Existing resource APIs
  are still mostly API-key protected, so dashboard integration should migrate
  routes carefully after session authorization rules are in place.

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
