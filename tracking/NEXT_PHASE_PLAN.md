# AgentLine Next Phase Plan

## Current Focus

**Phase 1 Decision Point: Choose The Next Build Track**

The Phase 1 mock core product is now implemented and documented enough for backend integration. The next work should be chosen based on what blocks the frontend and business validation most.

## Recommended Next Track

**API-Key Management CRUD** is the best next backend slice before Stripe or real telecom.

Reason:

- The frontend settings area needs API-key list/create/revoke.
- Current auth works but API keys are seed-only.
- Developers need a way to rotate keys before real users test the product.

## Track A: API-Key Management CRUD

Build:

- `GET /v1/api-keys`
- `POST /v1/api-keys`
- `DELETE /v1/api-keys/:id`
- optional `PATCH /v1/api-keys/:id` for label/status.

Rules:

- Return raw API key only once on creation.
- Store only hash and prefix.
- Revoke instead of deleting.
- Audit key creation/revocation.
- Never expose `keyHash`.

Definition of done:

- service tests.
- auth compatibility verified.
- docs/API examples updated.
- tracking updated.

## Track B: Stripe Billing Endpoints

Build after API-key CRUD or when payment validation becomes urgent:

- `POST /v1/billing/checkout-sessions`
- `POST /v1/billing/portal-sessions`
- `POST /v1/billing/stripe/webhook`
- `GET /v1/billing/transactions`

Rules:

- Use Stripe Checkout for prepaid credits.
- Use Stripe Customer Portal for payment methods/invoices.
- Credit AgentLine balance only from verified Stripe webhook events.
- Store Stripe event ids for idempotency.

## Track C: DB-Backed E2E Tests

Build when local Postgres is available:

- seed database.
- run golden smoke flow with Supertest.
- verify auth, agents, numbers, messages, calls, webhooks, usage, and billing.

## Track D: Real Provider Preparation

Start after mock API is stable:

- provider adapter contract tests.
- Twilio/Telnyx normalized error mapping.
- provider raw event ingestion skeleton.

## Current Recommendation

Implement **Track A: API-Key Management CRUD** next.

## Not In The Immediate Next Slice

- React frontend code.
- Real Twilio/Telnyx.
- Hosted AI.
- Real outbound webhook worker.
- Full Stripe implementation unless explicitly prioritized.
