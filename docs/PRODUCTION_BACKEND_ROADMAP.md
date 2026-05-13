# AgentLine Production Backend Roadmap

This document is the production-readiness plan for moving AgentLine from a mock
MVP into real backend flows.

Goal:

> Every user-facing operation should go through the NestJS backend, persist real
> domain records, trigger real provider integrations where configured, and be
> safe enough for test/live production rollout.

This is not a frontend design plan. It is the backend implementation roadmap for
Google auth, Twilio, Stripe, Brevo email, production configuration, security,
observability, and removal/quarantine of mock-only behavior from production
paths.

## Production Principles

- Backend is the source of truth for all operations.
- Frontend must call backend APIs through `src/lib/api/*`; it must not create
  fake local state for production flows.
- Mock provider is allowed only for automated tests and contract tests.
- Local product development should use Twilio test credentials by default, not
  mock provider behavior.
- Production and staging must use real provider adapters or fail closed with a
  clear configuration error.
- Provider-specific data must stay behind provider adapters and normalized domain
  records.
- Every external webhook must be signature-verified and idempotent.
- Every billable operation must authorize billing before the provider write and
  settle billing after final provider state.
- Secrets must live in environment/secret manager, never in code or seed files.
- Test and live provider modes must be separated.

## Target Production Stack

Recommended initial production stack:

| Area | Choice | Notes |
|---|---|---|
| Runtime | NestJS on Node.js | Current backend stack. |
| Database | PostgreSQL | Local Docker now; production Cloud SQL or equivalent. |
| ORM | Prisma | Existing data layer. |
| Hosting | Google Cloud Run | Good fit for early production and affordable scaling. |
| Secrets | Google Secret Manager | Store OAuth, Stripe, Twilio, Brevo secrets. |
| Auth | Google OAuth + secure backend sessions | API keys remain for developer API access. |
| Telecom | Twilio first | Numbers, SMS, voice, callbacks, recordings. |
| Payments | Stripe test and live | Checkout/top-up first, later subscriptions/invoices. |
| Email | Brevo transactional email | Invites, auth emails, billing/security notifications. |
| Jobs | Start with DB-backed worker/cron, later queue | Webhook retries, provider reconciliation, billing settlement. |
| Logs/Monitoring | Google Cloud Logging + Error Reporting | Add OpenTelemetry/Sentry later if needed. |

## Environment Modes

Use explicit environment modes.

| Mode | Purpose | Provider Behavior |
|---|---|---|
| `local` | developer machine | Twilio test credentials by default |
| `local-webhook` | local inbound/callback testing | Twilio live-dev credentials with public tunnel |
| `test` | automated tests | mock/signed fixtures only; no network dependency |
| `staging` | real integration testing | Twilio test/live-dev, Stripe test, Brevo test sender |
| `production` | real customers | Twilio live, Stripe live, Brevo production sender |

Required rule:

- `mock` provider must be disabled in `production`.
- `mock` provider must also be disabled in `staging` and `local`.
- If `NODE_ENV=production` and `TELECOM_PROVIDER=mock`, backend must refuse to
  boot.
- See `TWILIO_TESTING_STRATEGY.md` for the local Twilio testing strategy.

## Phase P0: Production Configuration Baseline

Goal:

Make the backend safe to configure for real environments before real provider
traffic starts.

Build:

- Central typed config service for:
  - app environment
  - public API URL
  - dashboard URL
  - database URL
  - cookie/session config
  - Google OAuth config
  - Twilio config
  - Stripe config
  - Brevo config
  - provider mode
- Strict startup validation for required variables by environment.
- Keep a small environment file set:
  - `.env.example` for local product development.
  - `.env.test.example` for automated tests.
  - `.env.staging.example` for tunnel/live-dev integration.
  - `.env.production.example` for real customer traffic.
- Twilio mode validation:
  - `test`
  - `live-dev`
  - `live`
- Secret naming convention for Google Secret Manager.
- Runtime readiness endpoint that reports missing provider config without
  leaking secrets.
- Provider guard that prevents mock provider outside `APP_ENV=test`.

Exit criteria:

- Backend clearly boots in local Twilio test mode.
- Backend refuses unsafe production provider configuration.
- No provider secret is ever returned by an API.

## Phase P1: Real Auth, Users, Sessions, And Workspace Switching

Goal:

Replace API-key-login-only dashboard auth with real Google OAuth and backend
sessions while keeping API keys for developer API usage.

Build:

- Google OAuth login:
  - `GET /v1/auth/google/start`
  - `GET /v1/auth/google/callback`
  - `POST /v1/auth/logout`
  - `GET /v1/users/me`
- Secure session storage:
  - HTTP-only cookies
  - CSRF protection for cookie-authenticated mutations
  - session table or encrypted opaque session tokens
  - session expiration and revocation
- User model completion:
  - Google subject ID
  - verified email
  - display name
  - avatar URL
  - last login
- Workspace membership:
  - list user's workspaces
  - create workspace
  - switch active workspace/project in session
  - accept invite flow
- Role-based access control:
  - owner
  - admin
  - developer
  - viewer
- Keep API-key auth for public/developer API:
  - API keys resolve workspace/project context.
  - Dashboard session auth resolves active workspace/project context.

Exit criteria:

- User can sign in with Google.
- User can create/select a workspace.
- Dashboard no longer depends on API key login for normal usage.
- API-key auth still works for developer API calls.

Current implementation status:

- First backend slice implemented:
  - `GET /v1/auth/google/start`
  - `GET /v1/auth/google/callback`
  - `POST /v1/auth/logout`
  - `GET /v1/users/me`
  - `GET /v1/workspaces`
  - `POST /v1/workspaces`
  - `POST /v1/workspaces/:workspaceId/switch`
  - `POST /v1/workspaces/invites/accept`
- Remaining before P1 is complete:
  - frontend Google login/workspace switch integration.
  - DB-backed e2e tests for OAuth/session behavior.
- Hardening already added:
  - CSRF double-submit cookie for session mutations.
  - workspace role checks for workspace mutations.
  - `AuthContextGuard` for routes used by both the dashboard and developer API
    keys.
  - Dashboard-facing resource APIs now use shared auth:
    - agents, numbers, messages, calls, contacts, conversations, webhooks,
      usage, billing dashboard endpoints, API keys, and audit events.
  - DB-backed OAuth/session e2e tests now cover:
    - mocked Google callback profile
    - session and CSRF cookies
    - `GET /v1/users/me`
    - workspace creation
    - workspace switching
    - a session-authenticated product route
    - logout and invalid-state rejection

## Phase P2: Brevo Transactional Email

Goal:

Add production transactional email for auth, team, billing, and operational
events.

Build:

- Brevo provider adapter.
- Email template registry.
- Team invite emails.
- Invite accepted/revoked notifications.
- Billing top-up success/failure emails.
- Low balance warning emails.
- Security emails:
  - new login
  - API key created
  - API key revoked
- Email delivery log table.
- Idempotent email send keys for important transactional flows.

Exit criteria:

- Workspace invite flow can send real email.
- Billing/security events can notify users.
- Failed email deliveries are logged without blocking critical state changes.

Current implementation status:

- First backend slice implemented:
  - Brevo transactional email provider adapter.
  - workspace invite email template.
  - `EmailDelivery` table and status enum.
  - invite create/resend delivery logging.
  - idempotent delivery key per invite/token.
  - authenticated `GET /v1/email/deliveries` delivery log API.
  - fail-soft delivery behavior for invites.
  - production startup validation for Brevo API key and sender email.
  - provider health now reports Brevo API-key and sender readiness without
    returning secret values.
- Remaining:
  - invite accepted/revoked emails.
  - billing and low-balance notifications.
  - security notifications.
  - dashboard screen for email delivery logs.

## Phase P3: Mock Quarantine And Provider Boundary Cleanup

Goal:

Remove mock behavior from product paths while preserving mock mode for automated
tests and contract tests.

Build:

- Audit every module for mock-only assumptions:
  - agents
  - numbers
  - messages
  - calls
  - conversations
  - usage
  - billing
  - webhooks
  - playground
- Ensure all provider operations go through the provider interface.
- Remove product-facing mock-only endpoints.
- Keep mock behavior inside test helpers and provider contract tests.
- Ensure seed data is dev-only.
- Remove or quarantine hardcoded fake IDs from production flows.
- Add tests proving production mode rejects mock-only operations.

Exit criteria:

- Local, staging, and production cannot accidentally provision/send/call through mock.
- Local development uses Twilio test credentials by default.
- Mock is still available for automated tests and contract tests.
- Tests can still use mock deterministically.

## Phase P3A: Core Dashboard Summary

Goal:

Give the frontend one backend-owned overview response for the core product
surface instead of forcing the dashboard to stitch many APIs or drift into mock
summary data.

Current implementation status:

- Backend complete:
  - `GET /v1/dashboard/summary`
  - core counts for agents, numbers, conversations, messages, calls, and
    webhooks
  - recent calls
  - recent conversations
  - daily/monthly usage event and cost totals
  - billing balance snapshot
  - safe provider readiness flags for Twilio, Stripe, and Brevo
- Remaining:
  - frontend overview integration.

## Phase P4: Twilio Numbers And SMS

Goal:

Make real phone number provisioning and SMS work end to end through Twilio.

Build:

- Twilio config:
  - account SID
  - auth token or API key/secret
  - test account SID
  - test auth token
  - Twilio mode: `test`, `live-dev`, or `live`
  - messaging service SID if used
  - public webhook base URL
  - status callback URL
- Number search:
  - country
  - area code
  - capabilities
  - price metadata when available
- Number provisioning:
  - billing authorization before Twilio purchase
  - Twilio purchase with inbound SMS callback URL
  - Twilio status callback URL
  - local number record persistence
  - rollback/reconciliation if local persistence fails
- Number release:
  - local status transition
  - Twilio release
  - idempotent retry if provider call fails
- Outbound SMS:
  - billing authorization before provider send
  - provider send
  - local message record
  - usage record
  - webhook event
- Inbound SMS:
  - verify Twilio signature
  - idempotency by Twilio MessageSid
  - normalize contact/conversation/message
  - usage record if billable
  - webhook event
- SMS status callbacks:
  - verify Twilio signature
  - idempotent status updates
  - duplicate callback suppression
- 10DLC/compliance fields:
  - brand status
  - campaign status
  - number compliance status
  - messaging restrictions

Exit criteria:

- A staging Twilio number can be purchased, attached to an AgentLine agent, send
  SMS, receive SMS, and show delivery status.
- Duplicate Twilio callbacks do not duplicate webhooks or usage events.
- Provider errors are normalized into AgentLine API errors.

## Phase P5: Twilio Voice

Goal:

Make real inbound/outbound voice calls work through Twilio.

Build:

- Inbound call webhook:
  - verify Twilio signature
  - route number to agent
  - create call record
  - return TwiML for webhook/hosted behavior
- Outbound call:
  - billing preauthorization before provider call
  - Twilio call create
  - local call record
  - status callbacks
- Call lifecycle:
  - queued
  - ringing
  - in_progress
  - completed
  - failed
  - busy
  - no_answer
  - canceled
  - transferred
- Recording:
  - recording callback
  - recording consent controls
  - storage policy
  - optional signed playback URL
- Transcript:
  - placeholder for webhook mode
  - later STT integration for hosted mode
- Transfer:
  - provider transfer/update
  - local state update
  - webhook event
- DTMF:
  - collect digits if needed
  - store interaction events
- Billing settlement:
  - preauthorize estimated first minute
  - settle final duration after call completion
  - refund/adjust if provider fails

Exit criteria:

- Real inbound and outbound calls create accurate AgentLine records.
- Call status and billing settle from Twilio callbacks.
- Customer webhooks receive clean call lifecycle events.

Current implementation status:

- In progress:
  - outbound call creation uses the configured provider adapter.
  - Twilio voice prompt and speech callbacks can create transcript turns for a
    live call.
  - call transfer and manual end routes exist.
  - Twilio voice status callbacks are idempotent through `ProviderRawEvent`.
  - duplicate status callbacks do not create duplicate lifecycle webhook events
    or duplicate billing settlement attempts.
  - late callbacks cannot move a terminal call back to a non-terminal state.
- Remaining:
  - inbound call record creation from the Twilio inbound voice webhook.
  - recording callbacks and recording consent settings.
  - provider-duration final settlement with adjustment ledger.
  - richer lifecycle timeline and provider failure reason storage.

## Phase P6: Stripe Test And Live Billing

Goal:

Use Stripe as the real billing/payment system for account balance, top-ups, and
later subscriptions/invoices.

Build:

- Stripe environment separation:
  - test publishable/secret/webhook keys
  - live publishable/secret/webhook keys
  - explicit mode in config
- Checkout/top-up:
  - create checkout session
  - success/cancel URLs
  - workspace metadata
  - allowed top-up amounts
- Webhook handling:
  - raw body preservation
  - Stripe signature verification
  - timestamp tolerance
  - event idempotency
  - DB transaction for balance credit + transaction record
- Billing ledger:
  - balance credits
  - usage debits
  - refunds/adjustments
  - provider event IDs
  - Stripe session/payment intent IDs
- Spend controls:
  - balance checks
  - spend limit checks
  - low balance threshold
  - optional auto-recharge later
- Test/live safety:
  - test mode cannot credit live balance
  - live webhook cannot be accepted in test mode
  - secrets and webhook endpoints separated

Exit criteria:

- Stripe test checkout credits workspace balance exactly once.
- Duplicate Stripe webhooks do not duplicate credits.
- Stripe live mode can be enabled by config without code changes.
- Telecom operations cannot overspend balance.

## Phase P7: Webhook Reliability Worker

Goal:

Make customer webhooks production reliable.

Build:

- Background worker for webhook delivery.
- Retry schedule.
- Dead/final failed state.
- Delivery attempt logs.
- Idempotency keys.
- Webhook signature rotation plan.
- Replay failed delivery endpoint.
- Backoff and timeout controls.
- Queue abstraction:
  - start DB-backed
  - later move to Cloud Tasks/Pub/Sub if needed

Exit criteria:

- Provider events and AgentLine domain events are delivered reliably.
- Failed customer endpoints do not block core product operations.
- Dashboard can inspect and replay failed deliveries.

## Phase P8: Security, Compliance, And Abuse Protection

Goal:

Protect the platform before inviting real external users.

Build:

- Rate limits:
  - API key
  - workspace
  - IP
  - auth routes
  - provider-triggering routes
- Abuse controls:
  - outbound SMS/call limits
  - destination country restrictions
  - blocked number list
  - suspicious activity flags
- Audit log expansion:
  - login/logout
  - workspace changes
  - billing changes
  - API key changes
  - provider operations
- Data retention controls:
  - messages
  - transcripts
  - recordings
  - raw provider payloads
- Recording consent settings.
- PII redaction plan.
- Compliance dashboard:
  - 10DLC status
  - recording consent
  - provider readiness
  - billing readiness

Exit criteria:

- Real users cannot create uncontrolled telecom/billing risk.
- Security-relevant actions are auditable.

## Phase P9: Google Cloud Production Deployment

Goal:

Deploy a production-ready backend environment on Google Cloud.

Build:

- Cloud Run service.
- Cloud SQL Postgres.
- Secret Manager.
- Artifact Registry.
- Cloud Build or GitHub Actions deploy.
- Environment-specific service accounts.
- Public domain and TLS.
- Database migration workflow.
- Backup and restore plan.
- Health/readiness checks.
- Structured logging.
- Error reporting.
- Alerts for:
  - high error rate
  - webhook failures
  - low Stripe webhook success
  - Twilio callback failures
  - database connection pressure
  - low balance/provider failures

Exit criteria:

- Staging and production are deployed separately.
- Secrets are managed outside source code.
- Rollback and migration procedures are documented.

## Phase P10: Production E2E Test Matrix

Goal:

Prove all real flows work before beta customers.

Test flows:

- Google OAuth login.
- Create workspace.
- Invite member through Brevo.
- Accept invite.
- Create agent.
- Add Stripe test balance.
- Provision Twilio test/staging number.
- Attach number to agent.
- Send outbound SMS.
- Receive inbound SMS.
- Receive SMS status callback.
- Start outbound call.
- Receive inbound call.
- Complete call and settle billing.
- Configure webhook.
- Deliver webhook.
- Retry failed webhook.
- Revoke API key.
- Release number.
- Verify audit logs.

Exit criteria:

- All staging E2E flows pass from dashboard and API.
- Test data can be cleaned safely.
- Known limitations are documented before production beta.

## Immediate Implementation Order

Recommended next backend sequence:

1. **Production config baseline**: strict config, environment modes, secret
   names, local Twilio test mode, no mock provider in staging/production.
2. **Provider runtime readiness**: Twilio/Stripe/Brevo readiness endpoint with no
   secret leakage.
3. **Google OAuth/session contract**: implement users/session/workspace switching.
4. **Stripe test checkout hardening**: verify test end-to-end before live.
5. **Twilio local/staging flow**: test credentials for REST flows, live-dev
   tunnel for inbound/callback flows, staging for full provider verification.
6. **Brevo invites/security emails**.
7. **Twilio voice staging flow**.
8. **Webhook worker/retry reliability**.
9. **Production deploy on Google Cloud**.
10. **Production E2E matrix and beta readiness review**.

## What To Remove Or Quarantine

Remove from production, staging, and local product behavior:

- Any route that creates fake provider state.
- Any seed/demo data used by real production users.
- Any frontend or backend flow that silently falls back to mock when Twilio is
  expected.
- Any provider ID exposed as a first-class public API contract unless wrapped in
  an explicit internal/debug provider object.

Keep for automated tests and contract tests:

- `mock` provider adapter.
- deterministic local seeds.
- unit tests using mock provider.

## Open Decisions

- Session storage: database-backed opaque sessions vs signed encrypted cookies.
- Whether to use Twilio Messaging Service from day one.
- Whether live number purchasing requires manual approval during beta.
- Whether hosted voice uses Twilio Media Streams first or webhook/TwiML first.
- Whether Brevo also handles magic-link auth later or only transactional email.
- Whether background jobs start DB-backed or use Cloud Tasks immediately.
