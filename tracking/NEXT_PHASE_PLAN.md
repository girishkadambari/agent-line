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

## ICP-First Implementation Priorities

The core ICP is developers and AI builders who need agents to operate over real
phone and SMS. Prioritize features that make this loop work end to end:

1. Create an agent.
2. Attach or import a real Twilio number.
3. Send and receive SMS.
4. Start and receive calls.
5. Capture transcript, summary, and structured outcome.
6. Deliver signed webhook events to the developer backend.
7. Show usage, billing, and debug logs by agent.

Do not prioritize generic SaaS polish ahead of this operating loop.

## Current Implementation Phase: Agent Operating Console

Status: in progress.

Implemented in this slice:

- `GET /v1/agents/:id/summary`
- Agent-scoped numbers, conversations, calls, messages, usage, and webhook
  delivery debug data.
- Frontend agent detail uses the summary endpoint as the source of truth.
- Agent lifecycle timeline across calls, messages, usage charges, and webhook
  deliveries.
- Agent detail overview shows usage cost, webhook failure count, and recent
  timeline activity.
- Agent detail debug tab shows recent usage and webhook delivery diagnostics.
- Provider issue normalization from Twilio raw callback events for failed SMS
  and voice statuses.
- Agent summary now includes provider issue count, issue details, and
  provider-issue timeline entries.

Exit criteria:

- Agent detail can answer: what numbers does this agent own, what happened
  recently, what calls/messages occurred, what webhooks failed, and what did it
  cost?

Remaining:

- Add cursor/limits for summary subsections once data volume grows.
- Persist normalized provider issue state on first-class call/message records if
  the derived raw-event view becomes too expensive.

## Next Implementation Phase: P2 Brevo Transactional Email

Status: first backend slice implemented.

Implemented:

- `EmailDelivery` Prisma model and `EmailDeliveryStatus` enum.
- Brevo provider adapter using the transactional SMTP API.
- Workspace invite email template.
- Invite create/resend email delivery path.
- Idempotent invite email delivery key per invite/token.
- Delivery ledger statuses:
  - `queued`
  - `sent`
  - `failed`
  - `skipped`
- Missing Brevo local config logs a skipped delivery instead of pretending an
  email was sent.
- `GET /v1/email/deliveries` for authenticated delivery log inspection.
- Production env validation now requires `BREVO_API_KEY` and
  `BREVO_FROM_EMAIL`.
- Provider readiness exposes Brevo API key/from-email configured state without
  exposing secret values.

Exit criteria:

- Workspace invite flow can send real Brevo email when configured.
- Missing/broken email provider config is visible in the delivery ledger.
- Failed email delivery does not roll back the actual invite state.

Remaining:

- Invite accepted/revoked notification emails.
- Billing top-up and low balance notification emails.
- Security emails for login/API key events.
- Dashboard view for email delivery logs.

## Following Phases

0.5. **P5A Call lifecycle accuracy**
   - Status: implemented.
   - Implemented:
     - Twilio `initiated`, `ringing`, `answered`, `in-progress`,
       `completed`, `failed`, `busy`, `no-answer`, and `canceled` statuses now
       normalize into AgentLine call states.
     - `answered` moves calls to `in_progress`.
     - Voice prompt callbacks can move a call to `in_progress` if the status
       callback is delayed or missing.
     - Terminal callbacks set `endedAt`, outcome, final duration, and billing
       settlement.
     - Late terminal callbacks can still settle final duration without emitting
       duplicate lifecycle webhooks.
     - Duplicate Twilio callbacks remain idempotent.
     - `GET /v1/calls/:id` returns provider callback diagnostics.
   - Remaining:
     - store provider diagnostics on first-class records if raw-event lookups
       become expensive.

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
   - Status: in progress.
   - Implemented:
     - Brevo adapter.
     - invite emails.
     - email delivery logs.
     - authenticated delivery log API.
     - idempotent invite send keys.
   - Remaining:
     - billing/security notifications.
     - email delivery dashboard/API.

2.5. **P2 Core dashboard summary**
   - Status: backend complete.
   - Implemented:
     - `GET /v1/dashboard/summary`
     - counts for agents, numbers, conversations, messages, calls, and webhooks
     - recent calls
     - recent conversations
     - daily/monthly usage totals
     - billing balance snapshot
     - safe Twilio/Stripe/Brevo readiness flags
   - Remaining:
     - frontend overview integration.

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
   - Status: in progress.
   - Implemented:
     - outbound call creation through the provider adapter.
     - inbound voice prompt/speech webhook handling.
     - transcript turn capture from Twilio speech callbacks.
     - transfer and manual end routes.
     - outbound calls now send Twilio voice status callback events as repeated
       form fields for `initiated`, `ringing`, `answered`, and `completed`.
     - idempotent Twilio voice status callbacks using `ProviderRawEvent`.
     - duplicate Twilio status callbacks are suppressed before usage settlement
       and customer webhook delivery.
     - late provider callbacks cannot regress already terminal call records.
   - Remaining:
     - inbound call record creation from Twilio webhook.
     - recording callbacks and consent controls.
     - final billing settlement from provider duration/cost with adjustment
       ledger.
     - richer call lifecycle timeline and failure reasons.

6. **P6 Stripe test/live billing**
   - checkout top-ups.
   - test/live mode separation.
   - idempotent webhooks.
   - atomic balance credits.

7. **P7 Webhook worker reliability**
   - Status: first real dispatch slice implemented.
   - Implemented:
     - matching active webhook endpoints are delivered immediately over HTTP.
     - delivery payloads are signed with AgentLine webhook headers.
     - delivery ledger records `succeeded` or `failed` with HTTP status/error.
   - Remaining:
     - background delivery worker.
     - automatic retry schedule.
     - replay endpoint backed by real delivery, not simulation.
     - final failed/exhausted state.

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
