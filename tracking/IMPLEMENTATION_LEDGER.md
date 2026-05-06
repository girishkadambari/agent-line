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

In progress:

- Phase 1 mock API implementation.

Next:

- Configure Postgres and verify DB push/seed.
- Webhook endpoint and delivery module.
- Usage ledger hooks.

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
