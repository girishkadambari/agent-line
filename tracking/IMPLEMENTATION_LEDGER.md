# AgentLine Implementation Ledger

This ledger records completed implementation work in chronological order. It must be updated after every implementation task.

## 2026-05-06: Documentation Foundation

**Status:** done

Implemented source-of-truth documentation:

- `docs/PRODUCT_SPEC.md`
- `docs/ROADMAP.md`
- `docs/PROJECT_DOCS.md`
- `docs/BACKEND_SPEC.md`
- `docs/FRONTEND_SPEC.md`
- `docs/AI_DEVELOPMENT_GUIDE.md`
- `docs/TECH_STACK.md`
- `docs/LOVABLE_FRONTEND_PROMPT.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PHASE_1_STATUS.md`

Key decisions:

- Product name is AgentLine.
- Backend is NestJS-first.
- Frontend will be separate React/Lovable frontend later.
- Phase 1 is mock backend only.

Verification:

- Manual file review.
- Docs index updated.

## 2026-05-06: Backend-Only NestJS Pivot

**Status:** done

Changed the implementation direction from earlier Next.js scaffold to backend-only NestJS.

Implemented:

- NestJS package setup.
- TypeScript config for backend.
- Nest CLI config.
- ESLint flat config.
- Prettier config.
- Jest/Supertest test setup.
- Open-source files: `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- Backend README.

Removed:

- Next.js config.
- Next.js app folder.
- Playwright config.
- Vitest config.
- Dead `src/app`, `src/server`, `tests/e2e`, and generated `dist`.

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed.

## 2026-05-06: Backend Scaffold And Health Route

**Status:** done

Implemented:

- `src/main.ts`
- `src/app.module.ts`
- `src/modules/health`
- `src/common/api`
- `src/common/errors`
- `src/common/filters`
- `src/common/pipes`
- `src/modules/prisma`
- `src/modules/auth`

Public route:

- `GET /v1/health`

Response:

```json
{
  "data": {
    "name": "AgentLine",
    "phase": "phase_1_mock_core_product",
    "status": "ok"
  }
}
```

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed.

## 2026-05-06: Prisma Schema And Seed Draft

**Status:** review

Implemented:

- `prisma/schema.prisma`
- `prisma/seed.ts`
- Prisma module and service.
- API-key hashing/prefix utilities.
- Phase 1 domain objects in schema.

Objects modeled:

- Workspace
- Project
- User
- APIKey
- Agent
- PhoneNumber
- Contact
- Conversation
- Message
- Call
- TranscriptTurn
- WebhookEndpoint
- WebhookDelivery
- UsageEvent
- BillingBalance
- Recording
- ProviderRawEvent

Verification:

- `npm run db:generate` passed.
- DB push/seed not yet run because a real `DATABASE_URL` is required.

Open item:

- Configure local/managed Postgres and run `npm run db:push && npm run db:seed`.

## Current Implementation State

Done:

- Backend-only NestJS scaffold.
- Open-source-ready repo metadata.
- Health route.
- Prisma schema draft.
- Seed script draft.
- Shared domain Zod schemas.
- Provider interface draft.
- Git initialized.
- API-key guard.
- Request context decorator.
- Agents module.
- Mock provider module.
- Numbers module.
- Workspace/team/invites/audit foundation.
- Contacts module.
- Conversations module.
- Messages module.
- Internal event module.
- Calls module.
- Stripe prepaid-credit checkout, portal, webhook idempotency, and test/live mode safeguards.

In progress:

- Phase 2 provider and billing hardening.

Next:

- Configure Postgres and verify DB push/seed.
- Webhook endpoint and delivery module.
- Usage ledger hooks.

## 2026-05-07: Stripe Test And Production Billing Hardening

**Status:** done

Implemented:

- Explicit `STRIPE_MODE` support for `test` and `live`.
- Stripe secret-key mode validation so `sk_test_...` cannot run in live mode and `sk_live_...` cannot run in test mode.
- Stripe webhook `livemode` validation so live events cannot credit a test backend and test events cannot credit a live backend.
- `GET /v1/billing/stripe/status` for safe runtime configuration checks without exposing secrets.
- Checkout and portal responses now include the Stripe mode.
- Checkout transaction metadata now records `stripeMode`.
- Stripe webhook balance creation now credits exactly the verified paid amount instead of adding local seed credits.
- `.env.example` now includes `STRIPE_MODE`.
- Stripe billing docs now include complete local test and production setup flows.

Verification:

- `npm test -- billing.service.spec.ts stripe-client.service.spec.ts` passed.
- `npm run build` passed.

## 2026-05-14: Stripe Subscription Trial And Credit Settlement

**Status:** implemented

Implemented:

- Stripe-backed signup billing state now creates or reuses a Stripe Customer for
  each workspace.
- New workspaces and first Google sessions ensure billing state exists.
- A one-time 14-day free trial usage allowance is granted per workspace.
- Added subscription plan catalog:
  - `free`
  - `starter`
  - `growth`
- Added subscription and allowance persistence:
  - `BillingSubscription`
  - `BillingAllowanceGrant`
  - `UsageSettlementMode`
- Added billing APIs:
  - `GET /v1/billing/plans`
  - `GET /v1/billing/subscription`
  - `POST /v1/billing/subscription-checkout-sessions`
- Stripe subscription Checkout creates trial subscriptions with plan metadata.
- Stripe webhooks now process:
  - `checkout.session.completed`
  - `customer.subscription.*`
  - `invoice.paid`
  - `invoice.payment_failed`
- Paid invoices grant included usage allowance for the billing period.
- Usage settlement now tries:
  1. trial/included allowance
  2. Stripe meter for active subscribed workspaces when configured
  3. prepaid balance
- Usage events now store settlement mode and allowance grant id so finance and
  support can explain exactly how each charge was settled.
- Stripe billing docs and `.env.example` now include recurring Price ids and
  subscription setup flow.

Verification:

- `npm run typecheck` passed.
- `npm test` passed: 30 suites, 127 tests.
- `npm run build` passed.

Stripe sandbox setup:

- Starter recurring product: `prod_UW68e3WkIpy5bG`
- Starter monthly price: `price_1TX3x2AbZABakwnS6QYENmgi`
- Growth recurring product: `prod_UW69dGEI04cpjg`
- Growth monthly price: `price_1TX3x7AbZABakwnSKh2k67lS`

## 2026-05-07: Backend Gap Register

**Status:** done

Implemented:

- Added `tracking/BACKEND_GAP_REGISTER.md`.
- Captured partially closed backend surfaces for workspace settings, team
  members, and invites.
- Captured open backend gaps for real auth/session/Google SSO, current-user
  profile, dashboard summary, provider runtime status, usage controls, and
  compliance settings.

Reason:

- The dashboard Settings screen now uses real workspace/member/invite APIs, and
  the remaining fake or pending UI states need an explicit backend source of
  truth before the next implementation phase.

## 2026-05-07: Product Hierarchy Source Of Truth

**Status:** done

Implemented:

- Added `docs/PRODUCT_HIERARCHY.md`.
- Linked the hierarchy document from `docs/README.md`.
- Added hierarchy rules to `docs/PROJECT_DOCS.md`.
- Updated the backend gap register to call out workspace list, workspace
  creation, and active workspace/project context as session-auth requirements.

Decision:

- Phase 1 API-key auth resolves exactly one workspace and one project.
- Workspace creation and workspace switching are intentionally deferred until
  user/session auth exists.

## 2026-05-06: Tracking System And Engineering Rules

**Status:** done

Implemented:

- `tracking/README.md`
- `tracking/IMPLEMENTATION_LEDGER.md`
- `tracking/NEXT_PHASE_PLAN.md`
- `tracking/ENGINEERING_RULES.md`
- `tracking/PHASE_REVIEW_CHECKLIST.md`

Rules added:

- Update implementation ledger after every implementation task.
- Keep next phase plan current.
- Run phase review checklist after every slice.
- Enforce backend-only NestJS modular monolith for Phase 1.
- Keep controllers thin and services focused.
- Keep provider logic behind adapters.
- Preserve open-source-ready setup and documentation.

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed.

## 2026-05-06: Phase 1 Slice 2 - API Foundation, Agents, And Numbers

**Status:** review

Implemented:

- `ApiKeyGuard`
- `CurrentContext` decorator
- `RequestContext` type
- API-key hash lookup and `lastUsedAt` update
- pagination limit helper
- `AgentsModule`
- `AgentsController`
- `AgentsService`
- `serializeAgent`
- `MockProviderModule`
- `MockProviderService`
- `NumbersModule`
- `NumbersController`
- `NumbersService`
- `serializeNumber`

Routes added:

- `GET /v1/agents`
- `POST /v1/agents`
- `GET /v1/agents/voices`
- `GET /v1/agents/:id`
- `PATCH /v1/agents/:id`
- `DELETE /v1/agents/:id`
- `GET /v1/numbers`
- `POST /v1/numbers`
- `GET /v1/numbers/:id`
- `PATCH /v1/numbers/:id`
- `DELETE /v1/numbers/:id`
- `POST /v1/agents/:id/numbers`
- `DELETE /v1/agents/:id/numbers/:numberId`

Behavior implemented:

- API-key auth reads `Authorization: Bearer <key>`.
- API key is hashed before lookup.
- Valid API key attaches workspace/project scope to request.
- Agents can be created, listed, fetched, updated, and disabled.
- `DELETE /v1/agents/:id` disables the agent instead of deleting history.
- Mock provider provisions deterministic numbers.
- Numbers can be provisioned, attached, detached, and released.
- Number release marks the number `released` instead of deleting history.

Tests added:

- API-key guard missing/invalid/valid key behavior.
- Agent create/list/disable behavior.
- Agent mode validation boundary.
- Mock provider number search/provision behavior.
- Number provision/attach, detach, and release behavior.

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 5 suites, 14 tests.
- `npm run build` passed.

Known limitations:

- DB-backed API integration tests are still pending because local Postgres is not configured.
- Usage event creation for number allocation is intentionally deferred until the usage module exists.
- Real provider adapters are not part of this slice.

## 2026-05-06: Phase 1 Slice 3 - Workspace, Team, Invites, And Audit

**Status:** review

Implemented:

- Global `User` model without direct `workspaceId`.
- `WorkspaceMember` model.
- `WorkspaceInvite` model.
- `AuditEvent` model.
- Workspace role/status enums.
- Invite status enum.
- Seeded local owner membership.
- `AuditModule`, `AuditService`, and `GET /v1/audit-events`.
- `WorkspacesModule`, `WorkspacesService`, and workspace/team/invite routes.
- Invite token creation and hashing.
- Last-owner protection.

Routes added:

- `GET /v1/workspaces/current`
- `PATCH /v1/workspaces/current`
- `GET /v1/workspaces/current/members`
- `PATCH /v1/workspaces/current/members/:memberId`
- `DELETE /v1/workspaces/current/members/:memberId`
- `GET /v1/workspaces/current/invites`
- `POST /v1/workspaces/current/invites`
- `DELETE /v1/workspaces/current/invites/:inviteId`
- `POST /v1/workspaces/current/invites/:inviteId/resend`
- `GET /v1/audit-events`

Tests added:

- Audit event recording.
- Invite token hashing.
- Last active owner protection.
- Member role update audit event.
- Invite creation stores hashed token and returns raw token once.

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 8 suites, 19 tests.
- `npm run build` passed.

Known limitations:

- Google SSO/session auth is not implemented yet.
- Invite email sending is not implemented; local/mock returns raw invite token.
- DB-backed integration tests still need configured Postgres.

## 2026-05-07: Phase 1 Slice 4 - Messages, Conversations, And Internal Events

**Status:** review

Implemented:

- `ContactsModule`
- `ConversationsModule`
- `MessagesModule`
- `EventsModule`
- Contact find-or-create by project phone number.
- SMS conversation find-or-create by agent/contact.
- Outbound mock SMS.
- Inbound SMS simulation.
- Message records.
- Internal events for `agent.message.sent` and `agent.message.received`.

Routes added:

- `POST /v1/messages`
- `GET /v1/conversations`
- `GET /v1/conversations/:id`
- `PATCH /v1/conversations/:id`
- `GET /v1/conversations/:id/messages`
- `POST /v1/messages/:id/reactions`
- `POST /v1/simulations/inbound-sms`

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run build` passed.

Known limitations:

- Full webhook delivery worker is not implemented yet.
- SMS usage/billing events are deferred to the usage slice.

## 2026-05-07: Phase 1 Slice 5 - Mock Calls And Transcripts

**Status:** review

Implemented:

- `CallsModule`
- Mock outbound call creation.
- Active voice-capable number requirement.
- Voice conversation find-or-create.
- Mock transcript turn generation.
- Call summary and structured outcome fields.
- Mock web-call token route.
- Call list/get/end/transfer routes.
- Transcript retrieval routes.
- Internal events for `agent.call.completed`, `agent.call.ended`, and `agent.call.transferred`.

Routes added:

- `POST /v1/calls`
- `POST /v1/calls/web`
- `GET /v1/calls`
- `GET /v1/calls/:id`
- `POST /v1/calls/:id/end`
- `POST /v1/calls/:id/transfer`
- `GET /v1/calls/:id/transcript`
- `GET /v1/calls/:id/transcript/stream`

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 13 suites, 32 tests.
- `npm run db:generate` passed.
- `npm run build` passed.

Known limitations:

- `/v1/calls/:id/transcript/stream` currently returns the transcript list shape; true SSE is deferred.
- Real inbound call routing is deferred to provider integration phases.
- Call usage/billing events are deferred to the usage slice.

## 2026-05-07: Review Fixes - Call Lifecycle Idempotency And Transcript SSE

**Status:** done

Implemented:

- `POST /v1/calls/:id/end` is idempotent for terminal call statuses and no longer emits duplicate terminal lifecycle events.
- `GET /v1/calls/:id/transcript/stream` now uses Nest SSE and emits transcript turns as stream events.
- Added a regression test for ending an already completed call.

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 13 suites, 33 tests.

## 2026-05-07: Phase 1 Slice 6 - Webhooks, Delivery Logs, And Retry Simulation

**Status:** review

Implemented:

- `WebhooksModule`
- webhook endpoint CRUD.
- webhook secret generation.
- HMAC SHA-256 payload signing.
- signed webhook test deliveries.
- delivery log listing and filtering.
- retry simulation with succeeded, failed, and exhausted outcomes.
- internal event bridge that creates pending deliveries for matching active endpoints.
- message and call services now create webhook deliveries from internal events.

Routes added:

- `GET /v1/webhooks`
- `POST /v1/webhooks`
- `PATCH /v1/webhooks/:id`
- `DELETE /v1/webhooks/:id`
- `POST /v1/webhooks/:id/test`
- `GET /v1/webhooks/deliveries`
- `POST /v1/webhooks/deliveries/:id/retry`

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 15 suites, 38 tests.
- `npm run build` passed.

Known limitations:

- Webhook delivery is still mock/local; no real outbound HTTP dispatch yet.
- Background queue worker is deferred.
- Usage/billing events are deferred to the usage slice.

## 2026-05-07: Review Fixes - Webhook Query Validation And Empty Body Defaults

**Status:** done

Implemented:

- delivery status query validation for `GET /v1/webhooks/deliveries`.
- empty-body defaults for webhook test and retry actions.

## 2026-05-07: Phase 1 Slice 7 - Usage Ledger And Billing Balance Simulation

**Status:** review

Implemented:

- `UsageModule`
- `BillingModule`
- Phase 1 pricing constants.
- billing balance lookup.
- billing balance debit helper.
- insufficient balance and spend-limit guards.
- usage event creation for mock number provisioning.
- usage event creation for outbound SMS.
- usage event creation for inbound SMS simulation.
- usage event creation for outbound mock call duration.
- daily and monthly usage rollups.

Routes added:

- `GET /v1/usage`
- `GET /v1/usage/daily`
- `GET /v1/usage/monthly`
- `GET /v1/billing/balance`

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 18 suites, 43 tests.
- `npm run db:generate` passed.
- `npm run build` passed.

Known limitations:

- Stripe, auto-recharge, and invoice generation are deferred.
- Real provider cost reconciliation is deferred.
- DB-backed API integration tests still need configured Postgres.

## 2026-05-07: Billing Consistency Hardening And Stripe Plan

**Status:** review

Implemented:

- billable number, SMS, and call records now perform usage/billing debit before persisted domain record creation.
- billing debits use conditional `updateMany` with `balanceCents >= cents`.
- spend limit checks use cumulative workspace usage before allowing a debit.
- regression tests cover failed usage preventing number/message/call persistence.
- `docs/STRIPE_BILLING_PLAN.md` added as the Stripe integration source of truth.

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 18 suites, 47 tests.
- `npm run build` passed.

## 2026-05-07: Phase 1 Slice 8 - API Contract Examples And Smoke Flow

**Status:** review

Implemented:

- `docs/API_EXAMPLES.md`
- `docs/SMOKE_FLOW.md`
- `docs/PROJECT_COMPLETENESS_CHECK.md`
- documentation index updates.
- README links for Phase 1 integration docs.

Coverage added:

- curl examples for every Phase 1 route group.
- end-to-end smoke flow from health check to billing balance.
- frontend integration order and UI state expectations.
- seeded local API key and ids.
- explicit Phase 1 completeness check.
- intentional deferrals for real telecom, Stripe endpoints, hosted AI, SDKs, and production safety.

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 18 suites, 47 tests.
- `npm run build` passed.

## 2026-05-07: Phase 1 Slice 9 - API-Key Management CRUD

**Status:** review

Implemented:

- `GET /v1/api-keys`
- `POST /v1/api-keys`
- `PATCH /v1/api-keys/:id`
- `DELETE /v1/api-keys/:id`
- API-key serializer that never exposes `keyHash`.
- one-time raw key return on create.
- hash-only key storage.
- revoke-not-delete behavior.
- audit events for create, update, and revoke.

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 19 suites, 51 tests.
- `npm run build` passed.

## 2026-05-07: Phase 1 Slice 10 - Stripe Billing Endpoints

**Status:** review

Implemented:

- `POST /v1/billing/checkout-sessions`
- `POST /v1/billing/portal-sessions`
- `POST /v1/billing/stripe/webhook`
- `GET /v1/billing/transactions`
- `BillingAccount` model.
- `BillingTransaction` model.
- Stripe customer creation.
- Stripe checkout session creation for prepaid credits.
- Stripe customer portal session creation.
- Stripe webhook HMAC verification using raw request body.
- idempotent Stripe event handling.
- balance credit on verified `checkout.session.completed`.

Verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 19 suites, 53 tests.
- `npm run db:generate` passed.
- `npm run build` passed.

## 2026-05-07: Stripe Webhook Hardening

**Status:** review

Implemented:

- unique Prisma constraint for Stripe `provider + providerEventId`.
- Stripe checkout completion processing now runs in a DB transaction.
- balance credit and billing transaction insert are atomic.
- duplicate Stripe events return duplicate without crediting balance.
- unscoped/unknown Stripe events are ignored without writing invalid workspace ids.
- Stripe webhook signatures reject timestamps outside tolerance.
- tests added for duplicate event handling, unscoped event ignore, valid timestamp, and stale timestamp.

Verification:

- `npm test` passed: 20 suites, 57 tests.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run build` passed.

## 2026-05-07: Docker Postgres, DB E2E, And Twilio Provider Prep

**Status:** review

Implemented:

- Docker Compose dev Postgres service on `localhost:5432`.
- Docker Compose test Postgres service on `localhost:5433`.
- `.env.test.example` for DB-backed e2e runs.
- `db:test:push` and `test:e2e:db` scripts.
- shared `TELECOM_PROVIDER` injection token.
- provider resolver module for `mock` and `twilio`.
- Twilio provider adapter behind the existing `TelecomProvider` interface.
- Twilio contract tests for missing credentials, SMS send, number search, and provider error normalization.
- DB-backed Phase 1 golden smoke e2e flow using Supertest and Docker test Postgres.
- backend/project docs updated for Docker DB and provider selection.

Verification:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 21 suites, 61 tests.
- `npm run db:test:push` passed against Docker Postgres on `localhost:5433`.
- `npm run test:e2e:db` passed: 2 suites, 2 tests.
- `npm run build` passed.

Open items:

- Live-test Twilio with real sandbox credentials before enabling customer traffic.

## 2026-05-07: Phase 2A - Twilio Number And SMS Safety

**Status:** review

Implemented:

- billable number provisioning now authorizes usage before provider purchase.
- number provisioning creates a local `provisioning` record before provider write.
- provider number is released and local usage is voided if persistence fails after provider success.
- outbound SMS now creates a local `sending` message before provider send.
- outbound calls now create a local `queued` call before provider create.
- failed pre-provider operations void usage debits through `UsageService.voidUsageForFailedOperation`.
- Twilio number provisioning includes inbound SMS/status callback URL support.
- Twilio outbound SMS includes message status callback URL support.
- public serializers no longer expose raw provider IDs.
- provider raw event idempotency constraints added for Twilio callbacks.
- `POST /v1/providers/twilio/sms/inbound`.
- `POST /v1/providers/twilio/sms/status`.
- Twilio inbound callbacks create contacts, conversations, messages, usage, internal events, and webhook deliveries.
- DB-backed smoke flow now simulates Twilio inbound and status callbacks.

Verification:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 21 suites, 62 tests.
- `npm run db:generate` passed.
- `npm run build` passed.
- `npm run db:test:push` passed against Docker Postgres on `localhost:5433`.
- `npm run test:e2e:db` passed: 2 suites, 2 tests.

Open items:

- Live-test Twilio with sandbox credentials before customer traffic.

## 2026-05-07: Phase 2B - Twilio Callback And Voice Billing Hardening

**Status:** review

Implemented:

- Twilio callback signature verifier using `X-Twilio-Signature`.
- inbound SMS callback route verifies against `TWILIO_INBOUND_SMS_WEBHOOK_URL`.
- SMS status callback route verifies against `TWILIO_MESSAGE_STATUS_CALLBACK_URL`.
- signed Twilio callback simulation in DB-backed e2e.
- duplicate Twilio inbound/status raw events suppress duplicate downstream side effects.
- voice call usage now preauthorizes ten minutes instead of one minute.
- voice call usage finalizes to actual provider duration and credits/debits the difference.
- unit tests for Twilio signature verification.
- unit tests for voice finalization/refund behavior.

Verification:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 22 suites, 65 tests.
- `npm run build` passed.
- `npm run test:e2e:db` passed: 2 suites, 2 tests.

Open items:

- Add provider request timeout/retry behavior.
- Add outbound SMS rate limits and 10DLC/compliance fields.
- Live-test Twilio with sandbox credentials before customer traffic.

## 2026-05-07: Contacts Public API

**Status:** done

Implemented:

- `GET /v1/contacts`
- `GET /v1/contacts/:id`
- `PATCH /v1/contacts/:id`
- Contacts controller protected by API-key auth.
- Contacts module imports `AuthModule` so `ApiKeyGuard` can resolve `ApiKeysService`.
- Contacts service list/detail/update methods.
- Contacts serializer relation counts for conversations, messages, and calls.
- Contact display-name and metadata update schema.
- Contacts module registered in the app module.

Verification:

- `npm test -- contacts.service.spec.ts` passed.
- `npm run lint` passed.
- `npm run build` passed.

## 2026-05-08: Production Backend Flow Planning

**Status:** planned

Context:

- The product is moving from mock-first MVP behavior to real production flows.
- Mock provider should remain available for local development and automated
  tests, but production/staging must use real providers or fail closed.
- Planned integrations: Google OAuth/session auth, Twilio telecom, Stripe
  test/live billing, Brevo transactional email, and Google Cloud deployment.

Implemented:

- Added `docs/PRODUCTION_BACKEND_ROADMAP.md`.
- Replaced `tracking/NEXT_PHASE_PLAN.md` with the production backend flow plan.

Next implementation priority:

1. P0 production configuration baseline.
2. Provider runtime readiness endpoint.
3. Google OAuth/session auth and current-user/workspace switching.
4. Stripe test/live hardening.
5. Twilio real number/SMS staging flow.

Guardrails:

- Do not let production run with `TELECOM_PROVIDER=mock`.
- Do not reintroduce mock data into production user-facing flows.
- Do not process unsigned provider webhooks.
- Do not perform provider writes before billing authorization.

## 2026-05-08: Twilio-First Local Testing Strategy

**Status:** planned

Context:

- Local product development should also use actual provider-shaped data.
- Twilio test credentials support selected REST API operations without charges,
  but they do not trigger real callbacks or inbound webhooks.
- Local inbound/callback testing needs a public tunnel and Twilio live-dev
  credentials.

Implemented:

- Added `docs/TWILIO_TESTING_STRATEGY.md`.
- Updated `docs/PRODUCTION_BACKEND_ROADMAP.md` so local defaults to Twilio test
  credentials, not mock.
- Updated `tracking/NEXT_PHASE_PLAN.md` to add `TWILIO_MODE` and local mock
  opt-in rules.

New policy:

- `local`: Twilio test credentials by default.
- `local-webhook`: Twilio live-dev credentials plus public tunnel.
- `test`: mock/signed fixtures allowed for deterministic no-network tests.
- `staging`: Twilio real/test provider flows, no silent mock.
- `production`: Twilio live, no mock.

Guardrails:

- Local mock mode is rejected.
- Twilio test mode must not expect status callbacks.
- Inbound SMS/call and status callback tests need live-dev tunnel or signed
  fixture contract tests.

## 2026-05-08: Provider Mode Guardrails Implemented

**Status:** done

Implemented:

- Added `src/config/env.validation.ts` with strict app/provider mode validation.
- Added `APP_ENV` support with `local`, `test`, `staging`, and `production`.
- Added `TWILIO_MODE` support with `test`, `live-dev`, and `live`.
- Local defaults now resolve to `TELECOM_PROVIDER=twilio` and
  `TWILIO_MODE=test`.
- `TELECOM_PROVIDER=mock` is rejected unless `APP_ENV=test`.
- Twilio test mode requires `TWILIO_TEST_ACCOUNT_SID` and
  `TWILIO_TEST_AUTH_TOKEN`.
- Twilio live-dev/live modes require `TWILIO_ACCOUNT_SID` and
  `TWILIO_AUTH_TOKEN`.
- Production requires `TWILIO_MODE=live`.
- Twilio provider adapter now uses test credentials in `TWILIO_MODE=test`.
- Removed product-facing `POST /v1/simulations/inbound-sms` from the controller.
- Updated DB-backed smoke flow to use signed Twilio inbound callback instead of
  product-facing inbound simulation.
- Added `GET /v1/health/providers` for secret-safe provider readiness.
- Added local/staging/production env examples.
- Updated current API/smoke/backend docs to remove the old inbound simulation
  route.

Verification:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 23 suites, 81 tests.
- `npm run test:e2e` passed: 1 suite passed, DB suite skipped without
  `TEST_DATABASE_URL`.
- `npm run build` passed.

Next:

- Add real Google OAuth/session auth.
- Add Twilio local live-dev webhook guide and runbook for ngrok callback testing.
- Add Stripe/Brevo readiness checks into deployment docs once credentials are
  provided.

## 2026-05-08: Environment Files Simplified

**Status:** done

Implemented:

- Removed the duplicate `.env.local.example` template.
- Made `.env.example` the single local development template.
- Kept `.env.test.example` for automated tests where the mock provider is
  allowed.
- Simplified `.env.staging.example` and `.env.production.example` so they only
  include deployment-relevant live-dev/live provider settings.
- Removed unused local Twilio callback placeholders from `.env` while keeping
  the configured local secrets intact.
- Added `STRIPE_MODE=test` to the local `.env` so Stripe behavior is explicit.
- Updated production backend, smoke, and Twilio testing docs to match the new
  environment file set.

Environment rule:

- Local product flows use Twilio test credentials through `.env`.
- Mock telecom stays in tests only.
- Live-dev webhook work uses staging-style variables with ngrok/public callback
  URLs.

## 2026-05-08: Twilio Test Number Provisioning Fix

**Status:** done

Issue:

- `TWILIO_MODE=test` was still calling Twilio available-number search before
  purchase.
- Twilio test credentials do not support `GET /AvailablePhoneNumbers`, so local
  number provisioning returned provider error `20008`.

Implemented:

- In Twilio test mode, number search returns the configured Twilio magic test
  number without calling Twilio.
- In Twilio test mode, number provisioning calls the supported
  `POST /IncomingPhoneNumbers` endpoint directly with `TWILIO_FROM_NUMBER`.
- In Twilio test mode, number release is a local no-op because Twilio does not
  create real account state for magic purchases.
- Added provider tests for test-mode search, provision, and release behavior.
- Updated `docs/TWILIO_TESTING_STRATEGY.md` to document the unsupported search
  endpoint and magic-number provision path.

## 2026-05-08: Twilio Live-Dev Voice Wiring

**Status:** done

Implemented:

- Switched local `.env` to `TWILIO_MODE=live-dev` with the configured ngrok
  public API URL and Twilio callback URLs.
- Added `POST /v1/providers/twilio/voice/inbound` to return signed TwiML for a
  real Twilio outbound call.
- Added `POST /v1/providers/twilio/voice/status` to accept signed Twilio call
  status callbacks and update the AgentLine call record.
- Twilio outbound calls now send voice status callback settings.
- Twilio call statuses now preserve `queued`, `ringing`, and `in_progress`
  instead of forcing non-terminal calls to `completed`.
- Twilio number provisioning now attaches both SMS and voice webhook URLs when
  those URLs are configured.
- Removed fake transcript/summary generation for Twilio calls; mock transcripts
  are now only created when the mock provider is used in tests.
- Updated env examples with `TWILIO_VOICE_STATUS_CALLBACK_URL`.

Operational note:

- A real live-dev call still requires a real Twilio-owned `PhoneNumber` record
  attached to the agent. Old `+15005550006` records are Twilio test-mode residue
  and should not be used for live-dev calls.

## 2026-05-08: Existing Twilio Number Import Flow

**Status:** done

Issue:

- Twilio trial accounts can own only one Twilio number.
- The AgentLine Numbers page previously treated the primary number action as
  provisioning, which means buying a new Twilio number.
- When a trial account already had a number, provisioning returned Twilio error
  `21404` instead of attaching the existing number to an AgentLine agent.

Implemented:

- Added `TelecomProvider.importNumber` to the provider contract.
- Added Twilio import support:
  - finds an existing `IncomingPhoneNumber` by E.164 phone number.
  - configures AgentLine SMS and voice callback URLs on that Twilio number.
  - returns the Twilio IncomingPhoneNumber SID as the provider number ID.
- Added `POST /v1/numbers/import`.
- Added Numbers service import behavior:
  - updates an existing local `PhoneNumber` row when the workspace already has
    the phone number.
  - creates a local row when the Twilio number exists but AgentLine has not
    recorded it yet.
  - does not debit the AgentLine number-provision usage ledger because the
    number was already bought in Twilio.
- Added tests for service-level import and Twilio provider import callback
  configuration.

Verification:

- `npm test -- numbers.service.spec.ts twilio-provider.service.spec.ts` passed.
- `npm run typecheck` passed.

Operational note:

- Use **Import existing** for the current Twilio trial number
  `+19012316325`.
- Use **Provision number** only when the product should buy a new Twilio number.

## 2026-05-08: Live-Dev Voice Transcript Capture

**Status:** done

Issue:

- Live Twilio calls were creating call records and lifecycle status updates, but
  no real conversation content because the TwiML only played a message and
  ended.

Implemented:

- Updated the Twilio voice TwiML response to use speech `<Gather>`.
- Added `POST /v1/providers/twilio/voice/gather`.
- The inbound voice handler now records the agent prompt as a transcript turn.
- The gather handler records the caller's speech result as a user transcript
  turn.
- Calls with captured speech now get a simple summary and
  `agent.call.transcript_updated` webhook event.
- Added `TWILIO_VOICE_GATHER_CALLBACK_URL` to env examples and Twilio testing
  docs.
- Added service tests for live Twilio prompt and speech transcript capture.

Verification:

- `npm test -- calls.service.spec.ts` passed.
- `npm run typecheck` passed.
- `npm run build` passed.

## 2026-05-12: P1 Auth, Sessions, And Workspace Context Slice

**Status:** review

Implemented:

- Added `UserSession` Prisma model with hashed opaque session token storage.
- Added session token utilities for raw token creation, SHA-256 hashing, cookie
  parsing, session cookie creation, and logout cookie expiration.
- Added `SessionGuard` that resolves HTTP-only session cookies into
  `RequestContext` with active workspace/project scope.
- Extended `RequestContext` to support both API-key and session auth actors.
- Added Google OAuth backend endpoints:
  - `GET /v1/auth/google/start`
  - `GET /v1/auth/google/callback`
- Added session endpoints:
  - `POST /v1/auth/logout`
  - `GET /v1/users/me`
- Added dashboard workspace endpoints:
  - `GET /v1/workspaces`
  - `POST /v1/workspaces`
  - `POST /v1/workspaces/:workspaceId/switch`
  - `POST /v1/workspaces/invites/accept`
- Google OAuth callback upserts users by verified email, creates a default
  workspace/project for first-time users, stores an opaque session, and redirects
  to `DASHBOARD_URL`.
- Workspace creation creates:
  - workspace
  - default test project
  - owner membership
  - zero-dollar billing balance
- Invite acceptance validates token, expiry, and email ownership before creating
  or reactivating workspace membership.
- Added production env validation for Google OAuth settings.
- Added Google OAuth env variables to local, staging, and production env
  examples.
- Added tests for session token utilities, session creation/current-user
  serialization, workspace creation, and invite acceptance.

Verification:

- `npm run db:generate` passed.
- `npm test -- session-token.utils.spec.ts session-auth.service.spec.ts workspaces.service.spec.ts` passed.
- `npm run typecheck` passed.

Remaining P1 work:

- Add frontend integration for Google login, `/users/me`, workspace create, and
  workspace switch.
- Add DB-backed e2e tests for the OAuth callback/session route using mocked
  Google responses.

## 2026-05-12: P1 Session Auth Hardening

**Status:** review

Implemented:

- Added CSRF double-submit cookie support for browser session mutations.
- Google OAuth login now sets:
  - HTTP-only `agentline_session`
  - readable `agentline_csrf`
- Logout expires both session and CSRF cookies.
- Added `CsrfGuard`; it enforces `X-CSRF-Token` for session-authenticated
  `POST`, `PATCH`, and `DELETE` requests, while leaving API-key calls
  unchanged.
- Added `AuthContextGuard` for shared product routes that support dashboard
  sessions and developer API keys.
- Added `WorkspaceRoles` decorator and `WorkspaceRoleGuard`.
- Updated `workspaces/current` routes to use `AuthContextGuard`.
- Added role checks for session-authenticated workspace mutations:
  - workspace update
  - member update/remove
  - invite create/revoke/resend
- Session workspace create/switch/invite-accept/logout now require CSRF.
- Added tests for CSRF, auth-context selection, workspace role checks,
  and updated session cookie behavior.
- Updated API examples with session CSRF requirements.

Verification:

- `npm test -- api-key.guard.spec.ts session-token.utils.spec.ts csrf.guard.spec.ts auth-context.guard.spec.ts workspace-role.guard.spec.ts session-auth.service.spec.ts workspaces.service.spec.ts` passed.
- `npm run typecheck` passed.
- targeted `eslint` passed.

## 2026-05-12: P1 Shared Dashboard Resource Auth

**Status:** implemented

Implemented:

- Applied `AuthContextGuard` to dashboard-facing resource APIs so the same
  endpoint can be used by:
  - browser dashboard sessions
  - developer API keys
- Applied `CsrfGuard` to resource controllers with session-authenticated write
  operations:
  - agents
  - numbers
  - messages
  - calls
  - contacts
  - conversations
  - webhooks
  - API keys
  - billing checkout and portal sessions
- Kept read-only dashboard data endpoints session/API-key compatible:
  - usage
  - audit events
  - billing balance, Stripe status, and transactions
- Left provider callback endpoints outside dashboard auth:
  - Stripe webhook remains signature verified by Stripe logic.
  - Twilio provider webhooks remain signature verified by Twilio logic.

Verification:

- `npm test -- api-key.guard.spec.ts auth-context.guard.spec.ts csrf.guard.spec.ts workspace-role.guard.spec.ts agents.service.spec.ts numbers.service.spec.ts messages.service.spec.ts calls.service.spec.ts contacts.service.spec.ts conversations.service.spec.ts webhooks.service.spec.ts usage.service.spec.ts billing.service.spec.ts audit.service.spec.ts` passed.
- `npm run typecheck` passed.
- targeted `eslint` passed.

## 2026-05-13: P1 OAuth Session E2E Coverage

**Status:** implemented

Implemented:

- Added DB-backed e2e coverage for the Google OAuth/session contract in
  `test/auth-session.e2e-spec.ts`.
- Mocked Google OAuth responses at the provider boundary while using the real
  Nest app, real Prisma/Postgres persistence, real session cookies, and real
  CSRF checks.
- Covered:
  - OAuth start redirect and state cookie creation
  - OAuth callback state validation
  - user/session/workspace creation from a Google profile
  - `GET /v1/users/me`
  - session workspace creation
  - session workspace switching
  - session-authenticated product route access through `AuthContextGuard`
  - logout and revoked-session rejection
  - invalid OAuth state rejection

Verification:

- `npm run test:e2e -- auth-session.e2e-spec.ts` passed with the suite skipped
  when `TEST_DATABASE_URL` is absent.
- `npm run db:docker:up` passed.
- `npm run db:test:push` passed.
- `npm run test:e2e:db -- auth-session.e2e-spec.ts` passed.
- `npm run typecheck` passed.
- `npm exec eslint -- test/auth-session.e2e-spec.ts` passed.

## 2026-05-13: P7 Webhook Event Contract Hardening

**Status:** implemented

Implemented:

- Added `docs/WEBHOOK_EVENT_STANDARD.md` as the source of truth for customer
  webhook envelopes, event families, subscription patterns, and delivery rules.
- Updated webhook delivery matching to support:
  - exact event names
  - prefix wildcards such as `agent.call.*`
  - global wildcard `*`
- Expanded the webhook envelope with:
  - `apiVersion`
  - `resource.type`
  - `resource.id`
  - stable internal event `createdAt`
- Enriched message webhook payloads with message ID, direction, body, status,
  provider IDs, contact, phone number, and timestamps.
- Enriched call webhook payloads with call ID, direction, phone numbers, status,
  outcome, summary, duration, provider IDs, contact, phone number, and timing.
- Added first-class `agent.call.failed` emission for failed call lifecycle
  states and provider-create failures after a local call record exists.
- Included `agent.call.status_updated` in agent summary webhook diagnostics.

Verification:

- `npm test -- webhooks.service.spec.ts calls.service.spec.ts messages.service.spec.ts` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- targeted `eslint` passed.

## 2026-05-13: P7 Webhook Event Catalog And Core Resource Events

**Status:** implemented

Implemented:

- Added a backend webhook event catalog endpoint: `GET /v1/webhooks/events`.
- Added production-useful webhook families:
  - `agent.created`, `agent.updated`, `agent.disabled`
  - `agent.number.provisioned`, `agent.number.imported`,
    `agent.number.attached`, `agent.number.detached`,
    `agent.number.released`, `agent.number.failed`
  - `agent.conversation.created`, `agent.conversation.updated`
  - `agent.contact.created`, `agent.contact.updated`
- Added wildcard catalog entries for:
  - `*`
  - `agent.*`
  - `agent.call.*`
  - `agent.message.*`
  - `agent.number.*`
  - `agent.conversation.*`
  - `agent.contact.*`
- Updated the local seed webhook subscription to use wildcard families.
- Updated `WEBHOOK_EVENT_STANDARD.md` with the expanded event taxonomy and
  payload expectations.

Verification:

- `npm run typecheck` passed.
- `npm test -- agents.service.spec.ts numbers.service.spec.ts contacts.service.spec.ts conversations.service.spec.ts webhooks.service.spec.ts messages.service.spec.ts calls.service.spec.ts` passed.
- `npm run build` passed.
- targeted backend `eslint` passed.

## 2026-05-14: P7 Webhook Delivery Reliability

**Status:** implemented

Implemented:

- Replaced simulated webhook retry success/failure with real HTTP
  re-delivery.
- Added manual delivery replay with `POST /v1/webhooks/deliveries/:id/replay`.
- Added a due-delivery processor endpoint:
  `POST /v1/webhooks/deliveries/process-due`.
- Added delivery attempt claiming before dispatch to reduce duplicate sends from
  concurrent retry paths.
- Added bounded retry backoff:
  - 1 minute
  - 5 minutes
  - 15 minutes
  - 1 hour
  - 3 hours
- Added final `exhausted` behavior after 5 failed attempts.
- Changed test webhook delivery to perform a real signed dispatch unless the
  request explicitly asks for simulated failure.
- Updated `docs/WEBHOOK_EVENT_STANDARD.md` with retry, replay, and exhaustion
  rules.

Verification:

- `npm test -- webhooks.service.spec.ts` passed.
- `npm run typecheck` passed.
- targeted backend `eslint` passed.
- `npm run build` passed.

## 2026-05-14: P6A Billing, Workspace Settings, And Controls

**Status:** implemented

Implemented:

- Added `GET /v1/billing/pricing` as the canonical backend rate card for:
  - phone number provision/import ownership
  - inbound SMS
  - outbound SMS
  - voice minutes
- Added `GET /v1/billing/cost-summary` with backend-calculated totals and
  breakdowns:
  - total cost in USD and cents
  - usage event count
  - quantity
  - channel breakdown
  - resource type breakdown
  - agent breakdown with agent names
  - recent usage events
  - spend-limit remaining amount
  - pricing rules used for the calculation
- Added `PATCH /v1/billing/controls` for workspace spend-limit updates.
- Added audit logging for billing control updates.
- Added `GET /v1/workspaces/current/settings` as the source of truth for the
  Settings screen:
  - workspace identity
  - current role
  - projects
  - member/invite/product counts
  - billing snapshot
  - provider readiness for Twilio, Stripe, and Brevo
  - permission controls for workspace, billing, invites, and API keys
- Added focused tests for billing pricing, controls, and cost summaries.

Verification:

- `npm test -- billing.service.spec.ts workspaces.service.spec.ts` passed.
- `npm run typecheck` passed.
- targeted backend `eslint` passed.
- `npm run build` passed.

## 2026-05-14: P6B Usage Evidence, Settlement, And Stripe Metering

**Status:** implemented

Implemented:

- Expanded `UsageEvent` into a settlement-grade usage ledger:
  - observed quantity
  - billable quantity
  - unit cost
  - total cost
  - pricing version
  - calculation evidence
  - detection evidence
  - settlement status
  - Stripe meter event id
- Added `UsageSettlementStatus` states:
  - `internal_debited`
  - `stripe_reported`
  - `stripe_failed`
  - `voided`
- Preserved voided usage rows for audit instead of deleting settlement evidence.
- Excluded voided usage from spend-limit checks, usage lists, rollups, and normal
  cost totals.
- Added settlement-status breakdowns to `GET /v1/billing/cost-summary`.
- Added optional Stripe Billing meter event reporting through
  `STRIPE_USAGE_METER_EVENT_NAME`.
- Made Stripe usage reporting idempotent for already reported usage rows.
- Added usage webhook events:
  - `agent.usage.recorded`
  - `agent.usage.finalized`
  - `agent.usage.voided`
- Updated Stripe billing and webhook documentation for evidence-based
  reconciliation.

Verification:

- `npm test -- usage.service.spec.ts billing.service.spec.ts stripe-client.service.spec.ts webhooks.service.spec.ts` passed.
- `npm test` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
