# AgentLine Stripe Billing Plan

## Purpose

Stripe will handle payment collection, customer payment methods, invoices, receipts, hosted checkout, and customer portal. AgentLine remains the source of truth for telecom usage events, mock/real provider usage, workspace entitlements, and product-level spend controls.

## Recommended Stripe Model

Use Stripe in this order:

1. **Stripe Checkout** for adding credits or starting a paid plan.
2. **Stripe Customer Portal** for payment method management, invoices, cancellation, and plan changes.
3. **Stripe webhooks** as the only trusted source for payment lifecycle updates.
4. **AgentLine usage ledger** as the product usage source of truth.
5. **AgentLine billing balance** as the internal prepaid credit ledger until mature usage-based invoicing is needed.

This keeps early implementation fast and avoids overbuilding metered Stripe subscriptions before pricing is stable.

## Phase 1 Billing Strategy

Phase 1 stays local/mock:

- `BillingBalance` stores prepaid workspace credits in cents.
- `UsageEvent` stores normalized usage and decimal cost.
- Billable mock actions debit the workspace balance before domain records are persisted.
- Stripe SDK is not required until real checkout/portal endpoints are implemented.

## Phase 2 Stripe Integration

Initial backend endpoints are implemented:

- `GET /v1/billing/stripe/status`
- `POST /v1/billing/checkout-sessions`
- `POST /v1/billing/portal-sessions`
- `POST /v1/billing/stripe/webhook`
- `GET /v1/billing/transactions`

The implementation uses Stripe HTTP APIs through a local provider wrapper. The Stripe SDK can be adopted later if richer types or automatic webhook helpers become useful.

Add Stripe without changing product usage semantics.

## Current Implementation Contract

AgentLine supports Stripe as a prepaid-credit top-up provider.

- Checkout sessions collect one-time payments for balance credits.
- Checkout `successUrl` and `cancelUrl` are only browser navigation URLs.
- AgentLine credits balance only from verified Stripe webhooks.
- `checkout.session.completed` is the first required production event.
- All Stripe event ids are stored for idempotency before balance is credited.
- Duplicate Stripe webhook deliveries return success without crediting twice.
- Test mode and live mode are explicit through `STRIPE_MODE`.
- Test mode requires an `sk_test_...` secret key or `rk_test_...` restricted key.
- Live mode requires an `sk_live_...` secret key or `rk_live_...` restricted key.
- Webhook payload `livemode` must match `STRIPE_MODE` when Stripe includes it.
- Webhook signing secrets are separate from API keys and are configured per endpoint.

### Environment Variables

```bash
STRIPE_MODE="test"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_WEBHOOK_TOLERANCE_SECONDS="300"
STRIPE_CREDIT_PRODUCT_NAME="AgentLine prepaid credits"
```

Use `GET /v1/billing/stripe/status` to verify backend configuration from the API without exposing secrets:

```json
{
  "data": {
    "mode": "test",
    "secretKeyConfigured": true,
    "secretKeyMatchesMode": true,
    "webhookSecretConfigured": true,
    "webhookToleranceSeconds": 300
  }
}
```

## Local Test Flow

Use this flow before any production attempt.

1. Set `STRIPE_MODE=test`.
2. Set `STRIPE_SECRET_KEY` to a Stripe sandbox server key beginning with `sk_test_` or `rk_test_`.
3. Start the backend on `http://localhost:3000`.
4. In a second terminal, run Stripe CLI webhook forwarding:

```bash
stripe listen --forward-to localhost:3000/v1/billing/stripe/webhook
```

5. Copy the printed `whsec_...` signing secret into `STRIPE_WEBHOOK_SECRET`.
6. Restart the backend so the webhook secret is loaded.
7. Call `POST /v1/billing/checkout-sessions` from the dashboard or curl.
8. Open the returned Checkout URL.
9. Use Stripe test card `4242 4242 4242 4242` with any future expiry and CVC.
10. Verify `GET /v1/billing/balance` increased by the paid amount.
11. Verify `GET /v1/billing/transactions` shows a pending checkout transaction and a succeeded webhook transaction.

Do not credit balance from the browser success page. The success page can refresh balance, but the webhook is the source of truth.

## Production Flow

Use this only after the test flow works end-to-end.

1. Set `STRIPE_MODE=live`.
2. Set `STRIPE_SECRET_KEY` to a live server key beginning with `sk_live_` or `rk_live_`.
3. Create a live Stripe webhook endpoint:

```text
https://api.yourdomain.com/v1/billing/stripe/webhook
```

4. Subscribe the endpoint to `checkout.session.completed`.
5. Copy that endpoint's live `whsec_...` signing secret into `STRIPE_WEBHOOK_SECRET`.
6. Configure Stripe Customer Portal in the live Stripe Dashboard.
7. Deploy with live backend env values in the production secret manager.
8. Call `GET /v1/billing/stripe/status` and confirm:

```json
{
  "mode": "live",
  "secretKeyConfigured": true,
  "secretKeyMatchesMode": true,
  "webhookSecretConfigured": true
}
```

9. Run a small real checkout using an internal account.
10. Confirm balance credit, transaction records, receipts, and portal access.

Production should use a separate production database from local/test data. Never point a live Stripe webhook at a local or staging database that does not contain the referenced workspace.

### Data Fields To Add

Add provider-neutral fields first:

- `WorkspaceBillingAccount`
  - `id`
  - `workspaceId`
  - `provider`
  - `providerCustomerId`
  - `defaultCurrency`
  - `status`
  - `createdAt`
  - `updatedAt`

- `BillingTransaction`
  - `id`
  - `workspaceId`
  - `provider`
  - `providerEventId`
  - `type`
  - `amountCents`
  - `currency`
  - `status`
  - `metadata`
  - `createdAt`

### API Endpoints

Add:

```http
POST /v1/billing/checkout-sessions
POST /v1/billing/portal-sessions
POST /v1/billing/stripe/webhook
GET  /v1/billing/transactions
```

### Checkout

Use Stripe Checkout for:

- prepaid credit packs.
- starter/pro/beta subscription plans if needed.
- collecting payment methods safely with hosted Stripe UI.

### Customer Portal

Use Stripe Customer Portal for:

- payment method updates.
- invoice history.
- subscription cancellation.
- plan changes.

### Stripe Webhook Events

Handle at minimum:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Webhook handling rules:

- Verify Stripe signatures.
- Store raw event IDs for idempotency.
- Never trust client success redirects for crediting balance.
- Credit balance only after a trusted Stripe event.

## Pricing Direction

Start with prepaid credits because telecom has real variable costs:

- Users add balance through Stripe Checkout.
- Usage debits AgentLine balance.
- Spend limits prevent runaway agent loops.
- Later, larger customers can move to invoiced monthly usage.

Avoid Stripe metered billing until:

- provider costs are stable.
- usage categories are final.
- customers want invoice-based postpaid plans.

## Official Stripe References

- Stripe API reference: https://docs.stripe.com/api
- Stripe Checkout: https://stripe.com/payments/checkout
- Stripe Customer Portal sessions: https://docs.stripe.com/api/customer_portal
- Stripe Billing overview: https://stripe.com/billing
