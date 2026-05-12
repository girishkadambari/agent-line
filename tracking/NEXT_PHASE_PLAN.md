# AgentLine Next Phase Plan

## Current Focus

**Production Backend Flows**

Source of truth:

- `docs/PRODUCTION_BACKEND_ROADMAP.md`

The backend is moving from mock-first MVP behavior to real production flows:
Google OAuth/session auth, Twilio telecom, Stripe billing, Brevo transactional
email, production configuration, provider readiness, security, and deployment.

## Production Rule

- Mock provider remains only for automated tests and contract tests.
- Local development should use Twilio test credentials by default.
- Local inbound/callback development should use Twilio live-dev credentials with
  a public tunnel.
- Production and staging must use real providers or fail closed with clear
  configuration errors.
- No user-facing production flow should silently fall back to mock data.

## Immediate Goals

- Add strict environment/config validation.
- Block mock telecom provider in local/staging/production.
- Add Twilio mode support: `test`, `live-dev`, `live`.
- Add provider runtime readiness without leaking secrets.
- Plan and implement Google OAuth/session auth for dashboard users.
- Keep API-key auth for developer API access.
- Harden Stripe test/live separation.
- Prepare Twilio number/SMS staging flow.
- Prepare Brevo transactional email for invites and security/billing events.

## Next Implementation Phase: P0 Production Configuration Baseline

Build:

- Typed config service for app, database, Google OAuth, Twilio, Stripe, Brevo,
  provider mode, Twilio mode, dashboard URL, and public API URL.
- Environment-specific required variable validation.
- `.env.example`, `.env.test.example`, `.env.staging.example`, and
  `.env.production.example`.
- Production guard:
  - `NODE_ENV=production` cannot run with `TELECOM_PROVIDER=mock`.
  - staging cannot run mock.
  - local cannot run mock.
  - unsafe missing provider config should fail closed.
- Provider readiness endpoint that reports configured/not configured/readiness
  without exposing secrets.

Exit criteria:

- Local Twilio test mode works with Twilio test credentials.
- Mock mode still works for automated tests and contract tests.
- Production mode refuses unsafe mock provider configuration.
- Provider readiness can power dashboard Service Health.
- No secret values are returned through APIs or logs.

## Following Phases

1. **P1 Auth/users/sessions/workspace switching**
   - Status: backend complete.
   - Implemented first backend slice:
     - Google OAuth start/callback.
     - HTTP-only opaque session cookies.
     - `GET /v1/users/me`.
     - user workspace list/create/switch.
     - invite acceptance.
     - API-key auth remains for developer API calls.
   - Remaining:
     - frontend Google login and workspace switch integration.
   - Implemented hardening:
     - CSRF double-submit cookie for session mutations.
     - `AuthContextGuard` for routes that support both browser sessions and
       developer API keys.
     - workspace role decorator/guard.
     - `workspaces/current` uses shared auth.
     - Dashboard-facing resource APIs use shared auth:
       - agents
       - numbers
       - messages
       - calls
       - contacts
       - conversations
       - webhooks
       - usage
       - billing dashboard endpoints
       - API keys
       - audit events
     - DB-backed OAuth/session e2e tests with mocked Google responses.

2. **P2 Brevo transactional email**
   - invite emails.
   - billing/security notifications.
   - email delivery logs.

3. **P3 Mock quarantine**
   - remove product-facing mock routes.
   - no production fallback to mock.
   - no default local fallback to mock.
   - dev/test seed separation.

4. **P4 Twilio numbers and SMS**
   - number search/provision/release.
   - existing-number import for Twilio trial/live-dev accounts that already
     own a number.
   - inbound/outbound SMS.
   - Twilio signature verification.
   - delivery callbacks.
   - billing authorization before provider write.

5. **P5 Twilio voice**
   - inbound/outbound calls.
   - status callbacks.
   - recordings.
   - transfer.
   - final billing settlement.

6. **P6 Stripe test/live billing**
   - checkout top-ups.
   - test/live mode separation.
   - idempotent webhooks.
   - atomic balance credits.

7. **P7 Webhook worker reliability**
   - background delivery.
   - retries.
   - replay.
   - final failed state.

8. **P8 Security/compliance/abuse**
   - rate limits.
   - spend limits.
   - audit expansion.
   - recording consent.
   - data retention.

9. **P9 Google Cloud deployment**
   - Cloud Run.
   - Cloud SQL.
   - Secret Manager.
   - CI/CD.
   - monitoring/alerts.

10. **P10 Production E2E matrix**
    - Google login.
    - workspace.
    - Stripe test balance.
    - Twilio SMS/calls.
    - Brevo invites.
    - webhook delivery.
    - audit logs.

## Review Findings To Watch

- Never expose provider secrets, OAuth secrets, Stripe secrets, Twilio auth
  tokens, Brevo keys, API-key hashes, or session tokens.
- Do not pretend Google SSO is active until real OAuth endpoints exist.
- Do not let provider writes happen before billing authorization.
- Do not credit Stripe balance outside an idempotent transaction.
- Do not process unsigned Twilio or Stripe webhooks.
- Do not allow production to use mock telecom.
- Do not allow local product flows to silently use mock telecom.
