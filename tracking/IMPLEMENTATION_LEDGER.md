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
- `.env.example` now includes `STRIPE_MODE` and `STRIPE_CREDIT_PRODUCT_NAME`.
- Stripe billing docs now include complete local test and production setup flows.

Verification:

- `npm test -- billing.service.spec.ts stripe-client.service.spec.ts` passed.
- `npm run build` passed.

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
