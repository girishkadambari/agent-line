# AgentLine Next Phase Plan

## Current Focus

**Phase 2C: Billing Live Verification And Frontend Billing Wiring**

Stripe test/live safeguards are implemented in the backend. The next work is to verify Stripe end-to-end with the user's real Stripe account, then wire the dashboard Billing page to the checkout, portal, status, balance, and transaction flows.

## Goals

- Keep `STRIPE_MODE=test` as the default for local development.
- Verify Stripe Checkout locally with Stripe CLI webhook forwarding.
- Verify live mode using a small internal production payment only after test mode passes.
- Surface Stripe status, balance, transactions, checkout, and portal flows in the dashboard.
- Keep Stripe webhooks as the only source of truth for credits.
- Keep mock telecom as the default while billing is verified.

## Build

- Dashboard billing status panel.
- Add-credit checkout flow using `POST /v1/billing/checkout-sessions`.
- Customer portal launch flow using `POST /v1/billing/portal-sessions`.
- Transaction list backed by `GET /v1/billing/transactions`.
- Success/cancel handling that refreshes balance instead of crediting directly.
- Local Stripe CLI checklist run.
- Production webhook checklist run.

## Phase 2C Implementation Order

1. Run backend billing tests and build after Stripe hardening.
2. Configure Stripe test keys and local webhook forwarding.
3. Complete a test checkout and verify balance/transaction records.
4. Wire frontend Billing page to checkout, portal, status, and transactions.
5. Add frontend success/cancel routes that refresh billing state.
6. Configure production Stripe webhook endpoint and run a small live verification.

## Review Findings To Watch

- Do not expose Stripe secret values in API responses or frontend logs.
- Do not credit balance from browser redirect success pages.
- Do not mix test keys, live keys, test webhooks, and live webhooks.
- Keep local, staging, and production databases separate.

## Alternative Next Track

Twilio hardening can continue in parallel after Stripe verification:

- provider request retry/backoff.
- provider rate-limit normalization.
- abuse controls for outbound SMS.
- 10DLC/compliance fields.

## Current Recommendation

Implement **Stripe billing verification and frontend billing wiring** next because the user has created a Stripe account and the core backend contract is now ready for end-to-end testing.
