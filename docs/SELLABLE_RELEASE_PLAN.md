# AgentLine Sellable Release Plan

## Purpose

This document turns the current AgentLine codebase into a market-release plan.
It is written for development execution, product prioritization, and launch
readiness. The goal is not to build every possible platform feature. The goal is
to ship a product that a real developer can understand, trust, test, and pay for.

AgentLine's sellable promise is:

> Give an AI agent a real phone line, let it send and receive SMS/calls, capture
> transcript and outcome evidence, deliver signed webhooks, and show exactly what
> happened and what it cost.

## Current Product Readiness Snapshot

### Strong Foundations Already Present

The current codebase already has the main platform spine:

- NestJS backend with Prisma/Postgres.
- Google OAuth/session auth and API-key auth.
- Workspace, project, members, invites, roles, and session workspace switching.
- Agent CRUD and agent operating summary.
- Twilio provider adapter for real numbers, SMS, callbacks, and outbound voice.
- Message, conversation, contact, call, transcript, and phone-number domain
  models.
- Signed customer webhooks with event catalog, wildcard subscriptions, retry,
  replay, and delivery status.
- Usage ledger with pricing evidence, settlement status, allowance grants, and
  Stripe meter hooks.
- Stripe customers, checkout top-ups, subscription checkout, trial/included
  allowance grants, portal sessions, and webhook idempotency.
- Brevo transactional invite email adapter and email delivery ledger.
- Audit events for trust-sensitive operations.
- Dashboard screens connected to real backend APIs, with mock data largely
  removed from production routes.

This is now beyond a mock MVP. The product has the shape of a real platform.

### Main Release Risk

The remaining risk is not basic CRUD. The risk is customer trust:

- Does the agent actually operate over a real number?
- Do call and SMS states match provider reality?
- Are webhook events complete and reliable?
- Can a customer understand cost and billing without opening database rows?
- Can a customer onboard, invite teammates, and recover from failures?
- Does the dashboard feel like an agent operations product, not an internal
  provider console?

The release plan below is ordered around that trust loop.

## ICP And Release Wedge

### Primary ICP For First Release

Target developers and small AI automation teams who already have an agent or
workflow and need real phone/SMS operations.

Good first customers:

- Building appointment reminders, lead follow-up, support triage, or admin call
  workflows.
- Comfortable using webhooks and API keys.
- Need transcripts, outcomes, usage evidence, and delivery logs.
- Want a faster path than stitching Twilio, webhook retries, transcript storage,
  billing, and dashboards themselves.

Poor first customers:

- Want a generic phone system.
- Want no-code campaign management.
- Need enterprise compliance before testing.
- Expect fully hosted conversational AI with no backend work.

### What Must Be Sellable

The first sellable version should make this demo real:

1. Sign in with Google.
2. Create a workspace.
3. Create an agent.
4. Import or provision a real phone number.
5. Attach the number to the agent.
6. Send SMS to a real person.
7. Receive inbound SMS into a real conversation.
8. Start an outbound call.
9. Capture call lifecycle, transcript turns, summary, and structured outcome.
10. Deliver signed webhook events.
11. Show cost, usage evidence, audit trail, and billing state.

If this loop is reliable, AgentLine is sellable even before hosted AI is
complete.

## Pending Items By Area

### Core Agent Phone Loop

Status: partially ready.

Implemented:

- Agents, numbers, messages, calls, conversations, contacts.
- Twilio outbound SMS and outbound call paths.
- Twilio SMS status callbacks.
- Twilio voice gather/transcript capture.
- Inbound Twilio voice call record creation from attached AgentLine numbers.
- Agent detail summary and timeline.

Pending:

- Better lifecycle history per call, not only current status.
- Persisted provider issue state on first-class call/message records.
- Recording callbacks and recording consent controls.
- Customer-facing explanation for trial Twilio restrictions and number import.

Launch requirement:

- Real outbound SMS, inbound SMS, outbound call, and inbound call must work in a
  live-dev/staging environment.
- Call status must move through reliable states and end with final duration.

### Webhooks And Developer Integration

Status: strong, but worker scheduling must be finished.

Implemented:

- Signed event envelope.
- Event catalog and wildcard subscriptions.
- Immediate HTTP delivery.
- Scheduled due-delivery worker.
- Retry/replay endpoints.
- Bounded retry states and exhausted state.
- Richer event payloads for calls, messages, contacts, numbers, conversations,
  agents, and usage.

Pending:

- Add full per-attempt history if support needs more than latest error/status.
- Add SDK helper for verifying signatures.
- Add quickstart sample app that receives events and controls an agent.

Launch requirement:

- Webhooks must deliver without blocking product operations.
- Failed webhooks must be visible, retryable, and explainable.

### Usage, Cost, Billing, And Evidence

Status: strong backend foundation, needs product simplification and release
hardening.

Implemented:

- Usage events with calculation evidence.
- Versioned rate-card tables for active usage pricing.
- Trial allowance, subscription allowance, prepaid balance, Stripe meter path.
- Stripe Checkout for top-ups and subscriptions.
- Stripe webhook idempotency and balance/account updates.
- Billing dashboard surfaces balance, plan, allowance, activity.
- Spend limit controls.

Pending:

- Add provider cost records for Twilio cost reconciliation.
- Add invoice/history surface that is customer-readable.
- Add low-balance and failed-payment emails.
- Clean billing UI so customers see "available to spend", "included usage",
  "this month", and "billing activity" without internal IDs by default.
- Add internal admin pricing controls outside the customer dashboard.

Launch requirement:

- Every billable action must produce a usage row with resource, evidence,
  quantity, unit cost, total cost, and settlement mode.
- Billing must never double-credit Stripe events.
- Customers must understand what they are paying for without seeing provider
  internals.

### Auth, Workspace, Team, And Admin

Status: backend mostly ready, needs live smoke and UX confidence.

Implemented:

- Google OAuth/session auth.
- API-key auth for developer API.
- Workspace create/list/switch.
- Members and invites.
- Brevo invite email path.
- Roles and workspace role checks in important routes.
- Audit log screen.

Pending:

- Full live Google OAuth browser smoke in production-like environment.
- Invite acceptance UX polish and clear error states.
- Role enforcement review across every mutation.
- Billing email, workspace slug, onboarding completion state.
- User profile/account settings polish.

Launch requirement:

- A new user can sign in, create a workspace, invite a teammate, and use the
  dashboard without API-key login.

### Settings, Service Health, And Product Trust

Status: direction corrected; needs final customer-facing polish.

Implemented:

- Settings no longer exposes Twilio/Stripe/Brevo as customer-facing product
  concepts.
- Service Health is customer capability oriented.
- Audit log screen shows workspace activity.
- Spend limit and guardrail controls exist.

Pending:

- Replace remaining engineering wording with customer outcomes.
- Split internal/operator diagnostics from customer dashboard.
- Add clear "Channels" readiness explanations:
  - phone numbers
  - messaging
  - voice
  - billing
  - webhooks
  - team email
- Add recording consent and data retention settings.

Launch requirement:

- Settings should answer: "Is my workspace ready, who has access, what are my
  limits, and what changed?"

### Frontend Product Experience

Status: functional, not yet fully sellable.

Implemented:

- Most screens are backend-backed.
- Mock data removed from production routes.
- Core tables, detail pages, drawers, copy actions, and status badges exist.
- Google session flow is integrated.

Pending:

- Final visual system pass using a modern, spacious product UI.
- Better onboarding from "create account" to "first working agent line".
- Stronger empty states that explain value and next action.
- Better data hierarchy in billing, usage, calls, webhooks, and agent detail.
- Fewer internal IDs on primary screens; show IDs behind copy/details.
- Responsive/mobile smoke for key flows.

Launch requirement:

- The dashboard must sell the value of AgentLine while being operationally
  useful. It should not feel like a raw developer console.

### SDK, MCP, Docs, And Examples

Status: not started enough for market release.

Pending:

- TypeScript SDK.
- Webhook signature verification helper.
- Minimal MCP server for agents to send SMS/place calls/check transcripts.
- Real sample app:
  - webhook-backed support agent
  - receives SMS/call events
  - returns structured outcome
  - logs usage and webhook evidence
- Public quickstart:
  - create agent
  - attach/import number
  - send SMS
  - receive webhook
  - start call
  - inspect transcript/outcome

Launch requirement:

- A developer should build their first useful flow in under 15 minutes.

## Release Phases

## Phase R0: Release Truth Cleanup

Goal:

Make the source of truth match the current product and remove stale mock-era
guidance from the working docs.

Build:

- Update old Phase 1 mock docs so they are clearly historical or moved into
  test-only guidance.
- Mark the current release target as "real Twilio/Stripe/Brevo production
  beta".
- Keep a single release checklist for backend, frontend, provider config, and
  smoke tests.
- Confirm no production route imports frontend mock data.
- Confirm backend rejects mock telecom outside `APP_ENV=test`.

Exit criteria:

- A new engineer or AI agent can read docs and know the current release target.
- There is no ambiguity between mock MVP and sellable release.

## Phase R1: Real Agent Phone Loop

Goal:

Make the main customer promise work end to end with a real phone number.

Build:

- Inbound Twilio voice call record creation. **Implemented 2026-05-17.**
- Final call duration settlement and adjustment ledger. **Implemented
  2026-05-17.**
- Voice callback lifecycle hardening:
  - queued
  - ringing
  - in progress
  - completed
  - failed
  - busy
  - no answer
  - canceled
- Provider failure reason persistence on call/message records.
- Number import/provision UX for Twilio trial and paid accounts.
- Staging/live-dev smoke script for:
  - outbound SMS
  - inbound SMS
  - outbound call
  - inbound call
  - transcript turn
  - webhook event
  - usage charge

Exit criteria:

- A real phone number can be attached to an agent and used for SMS and calls.
- Every call/message produces a correct record, event, usage row, and visible
  timeline.

## Phase R2: Trust, Usage, Billing, And Cost Evidence

Goal:

Make customers trust the money side before launch.

Build:

- Versioned rate-card tables:
  - rate card. **Implemented 2026-05-17.**
  - rate. **Implemented 2026-05-17.**
  - billing product
  - workspace pricing override
- Provider cost records for Twilio reconciliation.
- Final voice settlement adjustment ledger. **Implemented 2026-05-17.**
- Customer-friendly billing activity labels.
- Invoice/payment history from Stripe.
- Low-balance and payment-failure emails.
- Admin-only pricing controls separate from customer settings.
- Usage detail drawer showing:
  - detected event
  - billable quantity
  - rate
  - total cost
  - settlement source
  - related agent/contact/call/message

Exit criteria:

- Customers can answer "why was I charged?" from the dashboard.
- Support can reconcile AgentLine usage with Stripe and Twilio evidence.

## Phase R3: Workspace, Team, And Safety Controls

Goal:

Make beta customers safe to onboard.

Build:

- Live Google OAuth smoke and production redirect setup.
- Complete invite acceptance UX.
- Role enforcement audit across all mutations.
- Data retention settings.
- Recording consent settings before enabling recordings.
- Spend-limit UX and low-balance warning UX.
- Audit filters by area/action/actor.
- User profile/account settings.

Exit criteria:

- A workspace owner can manage teammates, roles, spend controls, and audit
  activity without support intervention.

## Phase R4: Webhook Reliability And Developer Experience

Goal:

Make AgentLine easy to integrate and reliable when customer systems fail.

Build:

- Scheduled due-delivery worker. **Implemented 2026-05-17.**
- Webhook attempt history if needed.
- Webhook signature verification helper.
- TypeScript SDK:
  - agents
  - numbers
  - messages
  - calls
  - webhooks
  - usage
- Example webhook receiver.
- Local webhook testing guide.
- API quickstart and copied curl snippets from the dashboard.

Exit criteria:

- A developer can receive signed events, replay failures, and integrate the SDK
  without reading backend source code.

## Phase R5: First Sellable Beta

Goal:

Ship to a small number of real users with controlled risk.

Build:

- Production environment on Cloud Run or equivalent.
- Cloud SQL/Postgres.
- Secret Manager.
- Stripe live mode.
- Twilio live mode.
- Brevo production sender.
- Dashboard production hosting.
- Monitoring and error reporting.
- Operational runbooks:
  - failed Twilio callback
  - failed Stripe webhook
  - low balance
  - webhook delivery failure
  - number provisioning failure
- Terms/privacy/compliance basics.
- Support contact and incident response path.

Exit criteria:

- 3 to 5 pilot customers can onboard and run real phone/SMS workflows with
  bounded usage limits.
- You can debug provider, billing, webhook, and user issues without direct DB
  inspection.

## Phase R6: Developer Ecosystem And Differentiation

Goal:

Move from "working product" to "harder to copy".

Build:

- MCP server:
  - send SMS
  - place call
  - fetch transcript
  - list conversations
  - inspect usage
- Sample real-world agents:
  - appointment reminder
  - lead qualification
  - support triage
  - missed-call follow-up
- Conversation memory across SMS and calls.
- Structured extraction schemas.
- Outcome analytics.
- Human handoff.
- Vertical templates.

Exit criteria:

- Customers choose AgentLine because it improves agent outcomes, not only
  because it wraps Twilio.

## Launch Blockers

These must be closed before public production release:

1. Provider cost reconciliation is not complete.
2. Recording consent/data retention controls are not complete.
3. Live Google OAuth, Stripe, Twilio, and Brevo smoke matrix must pass.
4. Frontend onboarding and settings need final customer-facing polish.
5. SDK/MCP/sample-agent story is not ready enough for developer-led adoption.

## What Can Be Sold First

Do not sell "full hosted AI phone agents" first unless hosted STT/TTS/LLM
orchestration is complete.

Sell this first:

> AgentLine is the phone operations layer for AI agents. Bring your own agent
> backend, attach a real number, handle SMS/calls through webhooks, and get
> transcripts, outcomes, usage, billing, retries, and audit logs out of the box.

This is narrower, clearer, and closer to the current codebase.

## 48-Hour Market Test

Setup:

- Prepare a live demo with one real AgentLine number.
- Show SMS send/receive, outbound call, transcript/outcome, webhook delivery,
  usage evidence, and billing activity.
- Offer 5 pilot slots with a hard usage cap.

Target:

- AI automation agencies.
- Developers building scheduling, support, lead-gen, or admin-call agents.
- Small SaaS teams adding phone/SMS agent workflows.

Pass metric:

- At least 3 qualified developers agree to test with their own workflow and
  connect a webhook within 7 days.

Fail signal:

- They only say "cool demo" but do not have a workflow, webhook endpoint, or
  willingness to pay for usage.

## Immediate Next Implementation Order

1. R1A: inbound voice record creation and lifecycle completion.
2. R1B: real Twilio smoke matrix with one owned number.
3. R2A: usage evidence drawer and billing simplification in dashboard.
4. R2B: final call settlement adjustment ledger.
5. R3A: role enforcement review and invite acceptance polish.
6. R4A: scheduled webhook retry worker.
7. R4B: TypeScript SDK quickstart.
8. R5A: production deployment runbook and environment checklist.
