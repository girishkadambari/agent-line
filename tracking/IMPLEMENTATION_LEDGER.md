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

In progress:

- Phase 1 mock API implementation.

Next:

- Configure Postgres and verify DB push/seed.
- Messages and conversations module.
- Webhook event creation.
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
