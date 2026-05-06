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

Add Stripe without changing product usage semantics.

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
