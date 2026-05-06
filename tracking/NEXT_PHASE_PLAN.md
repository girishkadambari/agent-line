# AgentLine Next Phase Plan

## Current Focus

**Phase 1 Backend Slice 8: API Contract Examples And Smoke Flow**

The backend now has the core mock product loop: workspace auth, agents, numbers, messages, calls, transcripts, webhooks, usage, and billing balance simulation. The next slice should make this easy for frontend builders, AI agents, and contributors to exercise end to end.

## Goals

This slice must deliver:

- API contract examples for every Phase 1 route group.
- Manual smoke-flow guide from API key to usage/billing.
- Frontend integration notes for the future React/Lovable dashboard.
- Seed data verification notes.
- Clear known limitations before real provider integrations.
- Stripe billing integration plan reference.

## Execution Order

### Step 1: API Examples Document

Create or update docs with examples for:

- health.
- workspace/team/invites/audit.
- agents.
- numbers.
- messages/conversations.
- calls/transcripts.
- webhooks/deliveries.
- usage/billing.

### Step 2: Smoke Flow

Document the golden Phase 1 flow:

- create agent.
- provision number.
- send SMS.
- simulate inbound SMS.
- create mock call.
- inspect transcript.
- create webhook endpoint.
- test delivery.
- inspect usage.
- inspect billing balance.

### Step 3: Integration Readiness

- Add frontend integration contract notes.
- Add expected empty/loading/error states for dashboard integration.
- Clarify no frontend code belongs in this backend repo yet.

### Step 4: Verification

- Run standard checks.
- If Postgres is configured, run `db:push` and `db:seed`.
- If Postgres is not configured, keep limitation documented.

### Step 5: Stripe Follow-Up

- Keep `docs/STRIPE_BILLING_PLAN.md` current.
- Do not add Stripe SDK until checkout/portal/webhook endpoints are implemented.
- Keep prepaid AgentLine balance as the early billing source of truth.

## Definition Of Done

- Docs are clear enough for another engineer or AI coding agent to integrate against Phase 1.
- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- Tracking ledger and review checklist are updated.

## Not In This Slice

- New product features.
- React frontend.
- Stripe.
- Real Twilio/Telnyx.
- Hosted AI.
