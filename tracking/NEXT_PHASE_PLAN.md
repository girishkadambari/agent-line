# AgentLine Next Phase Plan

## Current Focus

**Phase 2D: Auth/Profile And Provider Runtime Status**

Stripe test/live safeguards and frontend billing wiring are implemented. The
next backend work is to close the biggest dashboard gaps: current-user/auth
status and telecom provider runtime status.

## Goals

- Add a safe current-user/profile endpoint for the dashboard.
- Keep API-key auth working for local development while planning session auth.
- Define workspace creation and switching as session-auth flows, not API-key
  flows.
- Add a safe telecom provider status endpoint with no secret leakage.
- Let Service Health read telecom readiness from backend data.
- Keep Google SSO disabled until real OAuth/session endpoints exist.

## Build

- `GET /v1/users/me` or equivalent profile endpoint.
- `GET /v1/me/workspaces` contract.
- `POST /v1/workspaces` contract.
- `POST /v1/session/active-context` contract.
- Provider status endpoint for `mock` and `twilio` runtime readiness.
- Frontend Auth Settings panel wired to current-user/profile once available.
- Frontend Service Health telecom row wired to provider runtime status.
- Documentation updates for auth/session and provider status contracts.

## Phase 2D Implementation Order

1. Implement provider runtime status endpoint first because it is low-risk and
   immediately improves Service Health.
2. Add current-user/profile endpoint backed by the API-key context.
3. Document the future session/Google SSO API contract before implementing
   OAuth.
4. Wire dashboard Settings/Auth and Service Health to the new endpoints.
5. Re-run backend and frontend builds.

## Review Findings To Watch

- Never expose provider secrets or API-key hashes.
- Do not pretend Google SSO is active until OAuth endpoints exist.
- Keep API-key local auth as a development bridge, not the final product auth.
- Provider status should report readiness, not attempt live provisioning.

## Alternative Next Track

Dashboard summary can continue in parallel:

- overview summary endpoint.
- recent activity endpoint.
- usage/balance compact summary.

## Current Recommendation

Implement **provider runtime status**, then **current-user/profile**, because
both unblock real dashboard settings and health visibility without introducing
OAuth complexity too early.
