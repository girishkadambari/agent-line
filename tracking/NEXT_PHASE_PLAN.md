# Vukho Next Phase Plan

## Current Focus

**Deployment Release Track**

Target: production-ready backend deployment today.

Do not add broad platform features in this track. Work only on release blockers
for the real operating loop:

1. Twilio inbound/outbound SMS and calls.
2. Usage evidence, balance checks, and billing settlement.
3. Stripe subscription, credits, portal, and webhook sync.
4. Brevo transactional notifications for invite, balance, and billing issues.
5. Audit evidence for trust-sensitive actions.
6. Health/readiness checks and deployment verification.

The only active tracking files for release execution are:

- `tracking/NEXT_PHASE_PLAN.md`
- `tracking/IMPLEMENTATION_LEDGER.md`
- `tracking/BACKEND_GAP_REGISTER.md`

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

## Deployment-Day Implementation Order

### D0: Verify Deployability

Status: active.

Goal: prove the backend can be built, started, configured, and monitored in a
real environment without mock fallback.

Checklist:

- `npm run typecheck`
- focused production-flow tests for billing, usage, Twilio callbacks, webhooks,
  email, and audit
- `npm run build`
- Prisma schema generated and deployable
- `/v1/health` returns ok
- `/v1/health/providers` returns safe readiness without exposing provider
  secrets
- production/staging config rejects mock telecom

### D1: Core Twilio Operating Loop

Status: active, nearly closed.

Goal: real SMS and call operations create records, usage, cost, audit, and
webhooks.

Checklist:

- inbound SMS is signed, idempotent, and creates contact/conversation/message
- outbound SMS checks balance before provider write
- inbound call is signed, idempotent, and creates contact/conversation/call
- outbound call checks balance before provider write
- call status callbacks move calls through accurate terminal states
- [x] provider failures are visible on the first-class message/call record
- all message/call lifecycle events dispatch signed webhooks

### D2: Billing, Balance, And Stripe

Goal: customers can trust credit, subscription, usage, and payment state.

Checklist:

- one billing service owns allowance, prepaid balance, spend limits, and
  settlement decisions
- Stripe Checkout credits balance only from signed webhooks
- Stripe subscription state syncs from webhooks and safe reconciliation
- low balance and spend-limit states are detectable
- usage evidence explains every charge

### D3: Email And Audit Trust Layer

Status: partially implemented.

Goal: important workspace and billing events are traceable and notify users.

Checklist:

- [x] Brevo invite email works
- [x] low balance email works
- [x] spend limit reached email works
- [x] payment failure email works
- [x] invite/member/API-key/billing/provider changes are audited
- [ ] audit actor labels are understandable to customers in every dashboard row

### D4: Deployment Smoke

Goal: one smoke flow proves the release promise.

Checklist:

- sign in
- create/select workspace
- create agent
- import/attach real Twilio number
- send SMS
- receive SMS
- place outbound call
- receive inbound call
- see transcript/outcome
- receive signed webhook
- see usage/cost/audit/billing evidence

## Current Implementation Phase: D0 Verify Deployability

Status: implemented.

Verified on 2026-05-18:

- `npm run typecheck` passed.
- `npm test -- billing.service.spec.ts usage.service.spec.ts calls.service.spec.ts messages.service.spec.ts webhooks.service.spec.ts audit.service.spec.ts --runInBand` passed.
- `npm run build` passed.

Next action: continue with D1/D2 only.

## Recent Completed Work: Real Agent Phone Loop

Implemented in this release phase:

- Agent operating summary and frontend agent detail source of truth.
- Provider issue normalization from Twilio raw callback events.
- Twilio outbound SMS, inbound SMS, outbound voice, voice gather transcript
  capture, and status callbacks.
- Twilio inbound voice call record creation from the called Vukho number.
- Inbound voice contact/conversation creation, usage preauthorization,
  `agent.call.started` webhook emission, and call audit evidence.
- Idempotency for repeated inbound Twilio voice webhooks.
- Final voice settlement adjustment billing transactions for provider-final
  call duration deltas.
- Automatic due-delivery worker for customer webhook retries.

Exit criteria:

- Real outbound SMS, inbound SMS, outbound call, and inbound call work in a
  live-dev/staging environment.
- Every call/message produces a correct record, event, usage row, and visible
  timeline.
- Agent detail can answer: what numbers does this agent own, what happened
  recently, what calls/messages occurred, what webhooks failed, and what did it
  cost?

Remaining:

- Staging/live-dev smoke script for SMS, voice, transcript, usage, and webhooks.
- Customer-facing number import/provision explanations for trial and paid
  account constraints.
- Recording consent and retention controls before recording support is enabled.

Latest D1 hardening:

- Twilio SMS delivery failures are persisted on the message record as normalized
  provider status, error code, and error text.
- Twilio voice status failures are persisted on the call record as normalized
  provider status, error code, and error text.
- Message/call serializers and lifecycle webhook payloads expose the normalized
  provider diagnostics.

## Next Implementation Phase: P6B Usage Evidence, Settlement, And Stripe Metering

Status: implemented.

Implemented:

- `GET /v1/billing/pricing` for the canonical Vukho rate card.
- `GET /v1/billing/cost-summary` for workspace/project cost calculation
  by channel, resource type, and agent.
- Cost summary returns:
  - total usage events
  - total quantity
  - total cost in USD decimal and cents
  - current prepaid balance
  - spend limit and remaining spend limit
  - recent usage events
  - billing rules used for calculation
- `PATCH /v1/billing/controls` for workspace spend-limit updates.
- `GET /v1/workspaces/current/settings` for settings-page source of truth:
  - workspace
  - current user role
  - projects
  - member/invite/product counts
  - billing snapshot
  - provider readiness
  - permission controls

Exit criteria:

- Frontend Settings and Billing pages can render from real backend data without
  placeholder "pending" cards.
- Users can inspect exactly why a cost was charged and set a workspace spend
  limit.
- Workspace switchers can show real workspaces/projects and active role
  context.
- Developers can receive signed usage/cost webhooks and reconcile Vukho
  usage rows with Stripe meter events.

Implemented in this trust slice:

- Usage events now store billable quantity, pricing version, calculation
  evidence, detection evidence, settlement status, and Stripe meter event id.
- Voided usage is preserved for audit but excluded from normal usage totals and
  spend-limit checks.
- Cost summary includes settlement-status breakdowns for finance/support
  investigation.
- Finalized usage can be reported to Stripe Billing meter events when
  `STRIPE_USAGE_METER_EVENT_NAME` is configured.
- Usage webhooks were added:
  - `agent.usage.recorded`
  - `agent.usage.finalized`
  - `agent.usage.voided`

Remaining:

- Low-balance and spend-limit notification emails.
- Provider-specific cost reconciliation against Twilio invoice data.
- Billing dashboard frontend integration.

## Following Implementation Phase: P2 Brevo Transactional Email

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
    normalize into Vukho call states.
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

6. **P6 Stripe billing, trials, credits, and usage settlement**
   - Status: in progress.
   - Implemented:
     - checkout top-ups.
     - test/live mode separation.
     - idempotent webhooks.
     - atomic balance credits.
     - signup/workspace creation creates a Stripe Customer billing identity.
     - first signup billing state grants a 14-day free trial usage allowance.
     - `GET /v1/billing/plans` exposes the backend plan catalog.
     - `GET /v1/billing/subscription` exposes customer, subscription, and
       allowance state.
     - `POST /v1/billing/subscription-checkout-sessions` starts Stripe
       subscription Checkout with plan metadata and trial days.
     - `customer.subscription.*` webhooks upsert `BillingSubscription`.
     - `invoice.paid` grants included usage allowance for the billing period.
     - usage settlement order is now trial/included allowance, Stripe meter for
       active subscribed workspaces when configured, then prepaid balance.
     - usage rows store `settlementMode` and `allowanceGrantId` for finance
       evidence.
   - Remaining:
     - set local env `STRIPE_STARTER_PRICE_ID` and `STRIPE_GROWTH_PRICE_ID`
       from the created sandbox recurring Price ids.
     - repeat product/price setup in live Stripe before production launch.
     - create Stripe Billing meter and set `STRIPE_USAGE_METER_EVENT_NAME` if
       usage-based overage invoicing is enabled.
     - frontend plan selection, subscription status, allowance usage, invoices,
       and portal flows.
     - end-to-end Stripe CLI test for subscription checkout, invoice paid, and
       allowance grant creation.

7. **P7 Webhook worker reliability**
   - Status: in progress.
   - Implemented:
     - matching active webhook endpoints are delivered immediately over HTTP.
     - delivery payloads are signed with Vukho webhook headers.
     - delivery ledger records `succeeded` or `failed` with HTTP status/error.
     - stable webhook event envelope documented in
       `docs/WEBHOOK_EVENT_STANDARD.md`.
     - exact, prefix wildcard, and global wildcard event subscriptions.
     - richer call/message webhook payloads with primary resource data.
     - first-class `agent.call.failed` webhook events for failed live calls.
     - `GET /v1/webhooks/events` event catalog.
     - agent, number, conversation, and contact resource lifecycle events.
     - real manual retry backed by HTTP re-delivery.
     - manual replay endpoint for stored delivery payloads.
     - due-delivery processor endpoint for retry workers.
     - bounded retry backoff and final `exhausted` state.
     - delivery attempt claiming to reduce duplicate concurrent sends.
   - Remaining:
     - run the due-delivery processor from a dedicated background worker or
       scheduled job.
     - persist per-attempt history if customers need full delivery audit trails
       beyond the latest status/error.

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

## Current Billing Flow Clarification

Subscription creation is webhook-confirmed, not created only by clicking the
dashboard button.

1. Dashboard calls `POST /v1/billing/subscription-checkout-sessions`.
2. Backend creates a Stripe Checkout Session and records a local
   `subscription_checkout_session.created` transaction with status `pending`.
3. User completes the Stripe Checkout page.
4. Stripe sends `checkout.session.completed` to
   `/v1/billing/stripe/webhook`.
5. Backend validates the Stripe signature, upserts `BillingSubscription`, and
   marks the pending local Checkout transaction as `succeeded`.
6. Later Stripe `invoice.paid` events grant included usage allowance for the
   billing period.

If step 4 is missed, `GET /v1/billing/subscription` now attempts to recover the
latest Stripe subscription for the workspace customer and create the local
subscription record. When that recovery succeeds, Vukho also marks the
latest matching pending subscription Checkout transaction as `succeeded`.

Next billing work:

- Add a visible "sync billing from Stripe" action for support/admin use.
- Add invoice list/status once invoice history becomes part of the UI.
- Add low-balance and failed-payment emails.
- Add a production runbook for Stripe CLI forwarding, webhook secrets, and
  dashboard webhook endpoint setup.
- Move usage pricing from constants into versioned rate-card tables:
  `BillingProduct`, `BillingRateCard`, `BillingRate`,
  `WorkspacePricingOverride`, and `ProviderCostRecord`.
- Add internal admin controls for phone number, SMS, voice, recording, hosted
  agent, and webhook delivery pricing after the customer-facing billing flow is
  stable.
