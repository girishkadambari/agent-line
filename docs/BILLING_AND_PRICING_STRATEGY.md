# Vukho Billing And Pricing Strategy

## Purpose

Vukho billing must make telecom usage feel predictable. Customers should see a simple plan, clear available funds, transparent rates, and an auditable usage trail. Internally, Vukho needs versioned price controls so phone number, SMS, voice, recording, hosted agent, and webhook costs can change without rewriting product code.

## Customer-Facing Billing Model

Vukho should sell as a hybrid SaaS plus usage product:

- **Subscription plan**: pays for platform access and includes a monthly usage allowance.
- **Included usage allowance**: consumed before prepaid credits or overage billing.
- **Prepaid credits**: optional top-ups for teams that want hard spend control.
- **Metered overage**: usage beyond allowance can be reported to Stripe Billing when the workspace has an active subscription and Stripe metering is configured.
- **Usage evidence**: every charge must map back to a usage event, resource id, provider evidence, rate version, and calculation.

The customer billing page should show:

- Current plan and subscription status.
- Available usage funds: included allowance plus prepaid credits.
- Used this month.
- Current usage rates.
- Recent human-readable billing activity.
- Link to Stripe Customer Portal for invoices, payment method, cancellation, and plan management.

The customer billing page should not lead with internal ids, provider ids, raw webhook events, or raw transaction identifiers. Those belong in a collapsible developer/support section or a future admin console.

## Current Public Rate Card

These are the current implementation defaults. They are intentionally simple while the product proves core telephony workflows.

| Usage item | Customer charge | Billing unit | Current trigger |
| --- | ---: | --- | --- |
| Phone number provision/import | $1.00 | event | Number is provisioned/imported into Vukho |
| Outbound SMS | $0.01 | message | Provider accepts outbound message |
| Inbound SMS | $0.01 | message | Provider inbound webhook is processed |
| Voice call | $0.03 | started minute | Final provider duration is settled |

Current pricing version: `2026-05-14`.

## Settlement Order

Every billable action creates or updates a `UsageEvent`. Settlement should happen in this order:

1. **Trial allowance**: first-time workspace trial credit.
2. **Subscription included allowance**: monthly plan allowance granted from successful invoices.
3. **Stripe metered usage**: active subscriptions can report overage to Stripe meter events.
4. **Prepaid balance**: workspace credit balance from one-time top-ups.
5. **Blocked usage**: if no allowance, meter path, or balance is available.

This gives three selling modes:

- **Self-serve trial**: users can test with included trial credit.
- **Subscription-first**: serious teams subscribe and get predictable monthly allowance.
- **Credit-controlled**: budget-sensitive users top up prepaid credits and avoid surprise invoices.

## Plan Packaging

Current plan hypothesis:

| Plan | Monthly price | Included usage | Target customer |
| --- | ---: | ---: | --- |
| Free trial | $0 | $5 | Evaluation and first real workflow |
| Starter | $29 | $20 | Solo developers, small automations, first AI phone agent |
| Growth | $99 | $100 | Agencies, SaaS teams, heavier call/SMS usage |

The plan price is not only telecom resale. It pays for:

- Agent-native API and dashboard.
- Provider setup abstraction.
- Webhook reliability and delivery logs.
- Conversation, call, transcript, and usage records.
- Outcome extraction and future agent intelligence features.
- Billing evidence and spend controls.

## Internal Pricing Controls

The next production-grade pricing layer should move rates from constants into versioned database records.

Suggested objects:

- `BillingProduct`: customer-facing sellable category such as `phone_number`, `sms`, `voice`, `recording`, `hosted_agent`, `webhook_delivery`.
- `BillingRateCard`: named pricing version with status `draft`, `active`, or `archived`.
- `BillingRate`: unit price, billing unit, rounding policy, minimum charge, effective date, and provider region.
- `WorkspacePricingOverride`: per-workspace contract pricing or promotional override.
- `ProviderCostRecord`: optional internal cost basis imported from Twilio/Stripe/provider invoices.

Rules:

- Usage events store the exact `pricingVersion`, `unitCost`, `billableQuantity`, and `calculation`.
- Old usage events never recalculate when rates change.
- Draft rate cards can be previewed but not used for live billing.
- Only one global rate card should be active per environment unless a workspace override exists.
- Provider raw cost and customer charge must stay separate.

## Billing Opportunities

Vukho can monetize more than raw telecom pass-through:

- **Phone number ownership**: monthly rental, setup/import fee, compliance review fee, reserved-number fee.
- **SMS**: inbound/outbound markup, high-volume packages, compliance-supported messaging.
- **Voice**: per-minute voice, call recording, transcription, hosted agent orchestration.
- **Agent outcomes**: structured extraction, success classification, workflow handoff.
- **Reliability**: webhook retries, delivery retention, audit logs, provider failover.
- **Developer experience**: SDKs, MCP server, local webhook testing, templates.
- **Enterprise**: SSO, roles, retention controls, BYO Twilio/Telnyx, custom pricing.

## Customer Trust Requirements

Billing must be explainable from the UI and database:

- Show what was charged.
- Show when it happened.
- Show which agent, number, call, message, or conversation caused it.
- Show the rate and billing unit.
- Show settlement source: allowance, Stripe meter, or prepaid balance.
- Show provider status when applicable.
- Never credit a payment from browser redirects alone; only verified Stripe webhooks can credit money.
- Never create duplicate credits from duplicate Stripe webhook deliveries.

## Stripe Responsibilities

Stripe should own:

- Checkout for one-time credit top-ups.
- Checkout for subscription starts.
- Customer Portal for invoices, cancellation, payment methods, and plan changes.
- Webhooks as the payment/subscription source of truth.
- Optional usage meter events for subscription overages.

Vukho should own:

- Usage detection.
- Pricing calculation.
- Allowance and prepaid settlement.
- Workspace spend controls.
- Usage evidence and customer-visible cost breakdown.
- Product entitlements and provider access decisions.

## Dashboard Information Architecture

Customer billing dashboard:

- Overview: plan, available funds, month-to-date spend.
- Usage pricing: current rates and units.
- Allowance: active trial or monthly included usage progress.
- Billing activity: friendly payment/subscription events.
- Stripe portal: invoices, payment methods, subscription cancellation.

Developer/support detail:

- Stripe mode.
- Stripe customer id.
- Balance id.
- Workspace id.
- Webhook health.
- Raw transaction ids.

Future internal admin:

- Rate cards.
- Provider cost imports.
- Workspace pricing overrides.
- Manual credits/debits.
- Billing dispute notes.
- Settlement reconciliation.

