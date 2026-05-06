# AgentLine Next Phase Plan

## Current Focus

**Phase 1 Backend Slice 7: Usage Ledger And Billing Balance Simulation**

The backend now supports mock agents, numbers, messages, calls, transcripts, internal events, and webhook delivery logs. The next slice should make costs inspectable and bounded in mock mode.

## Goals

This slice must deliver:

- Usage event creation for number provisioning, SMS, calls, and recordings where applicable.
- Billing balance lookup.
- Mock billing balance debit simulation.
- Usage list and rollup endpoints.
- Daily and monthly usage summaries.
- Tests for usage event math and workspace/project scoping.

## Execution Order

### Step 1: Usage Pricing Constants

- Define Phase 1 mock unit costs in one place.
- Keep prices provider-neutral and easy to replace later.
- Use decimal-safe calculation for persisted `Decimal` fields.

### Step 2: Usage Module

Implement:

- `GET /v1/usage`
- `GET /v1/usage/daily`
- `GET /v1/usage/monthly`

### Step 3: Billing Module

Implement:

- billing balance lookup.
- balance debit helper.
- spend-limit conflict guard.
- mock balance response for dashboard.

### Step 4: Usage Hooks

Create usage events for:

- mock number provisioning.
- outbound SMS.
- inbound SMS simulation.
- outbound mock call duration.
- transcript/recording placeholder only if billable in Phase 1.

### Step 5: Tests

Add tests for:

- usage event creation.
- cost calculation.
- billing debit.
- insufficient balance/spend-limit conflict.
- daily rollup.
- monthly rollup.
- workspace/project scoping.

## Definition Of Done

- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run db:generate` passes.
- `npm run build` passes.
- Tracking ledger and review checklist are updated.

## Not In This Slice

- Stripe.
- Auto-recharge.
- Invoice generation.
- Real provider cost reconciliation.
- React frontend.
- Real Twilio/Telnyx.
- Hosted AI.
