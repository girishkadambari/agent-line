# AgentLine Next Phase Plan

## Current Focus

**Phase 1 Decision Point: Stripe Billing Or DB-Backed E2E**

The mock core product and API-key management are now implemented. The next work should either validate payments with Stripe or validate the full backend loop against a real Postgres database.

## Recommended Next Track

**Stripe Billing Endpoints** are the recommended next implementation track if business validation and paid beta readiness are the priority.

Build:

- `POST /v1/billing/checkout-sessions`
- `POST /v1/billing/portal-sessions`
- `POST /v1/billing/stripe/webhook`
- `GET /v1/billing/transactions`

Rules:

- Use Stripe Checkout for prepaid credits.
- Use Stripe Customer Portal for payment method and invoice management.
- Credit AgentLine balance only from verified Stripe webhook events.
- Store Stripe event ids for idempotency.
- Keep AgentLine `UsageEvent` as product usage source of truth.

## Alternative Track

**DB-Backed E2E Tests** if implementation confidence is the priority.

Build:

- seeded Postgres test setup.
- Supertest smoke flow.
- auth, agents, numbers, SMS, calls, webhooks, usage, and billing assertions.

## Current Recommendation

Implement **Stripe Billing Endpoints** next if you want faster go-to-market and paid beta readiness.

## Not In The Immediate Next Slice

- React frontend code.
- Real Twilio/Telnyx.
- Hosted AI.
- Real outbound webhook worker.
