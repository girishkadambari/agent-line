# AgentLine Phase Review Checklist

Use this checklist after every implementation slice.

## Slice Review Template

Copy this section for each completed slice.

```md
## YYYY-MM-DD: Slice Name

Status: review | done | blocked

### Scope Completed

- [ ] Item 1
- [ ] Item 2

### Architecture Review

- [ ] Module boundaries are clear.
- [ ] Controllers are thin.
- [ ] Services own business logic.
- [ ] Provider-specific logic is isolated.
- [ ] Public API responses are provider-neutral.
- [ ] No frontend code was added to backend repo.

### Code Quality Review

- [ ] Names are clear.
- [ ] Files have single responsibility.
- [ ] No dead code or dead folders remain.
- [ ] No secrets are committed.
- [ ] No generated build output is tracked.

### API Review

- [ ] Routes match `docs/BACKEND_SPEC.md`.
- [ ] Response shape uses `{ data }`.
- [ ] Error shape uses `{ error: { code, message, details } }`.
- [ ] Auth behavior is correct.
- [ ] Workspace/project scope is respected where applicable.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`

### Docs And Tracking

- [ ] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [ ] `tracking/NEXT_PHASE_PLAN.md` updated if needed.
- [ ] `docs/` updated if behavior changed.

### Known Limitations

- List limitations here.

### Next Actions

- List next actions here.
```

## 2026-05-06: Backend Scaffold Cleanup

Status: done

### Scope Completed

- [x] Removed dead Next.js scaffold folders.
- [x] Removed generated `dist`.
- [x] Initialized Git repository.
- [x] Confirmed no empty `src` folders remain.

### Architecture Review

- [x] Module boundaries are clear for scaffold.
- [x] Controllers are thin.
- [x] Services own business logic where services exist.
- [x] Provider-specific logic is isolated by design.
- [x] Public API responses are provider-neutral.
- [x] No frontend code remains in backend repo.

### Code Quality Review

- [x] Names are clear.
- [x] Files have single responsibility.
- [x] No dead code or dead folders remain.
- [x] No secrets are committed.
- [x] No generated build output is tracked.

### API Review

- [x] Health route is backend-only and follows `{ data }`.
- [x] Error helpers follow documented shape.
- [ ] Auth behavior is not implemented yet.
- [ ] Workspace/project scope is not implemented yet.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`

### Docs And Tracking

- [x] `tracking/IMPLEMENTATION_LEDGER.md` created.
- [x] `tracking/NEXT_PHASE_PLAN.md` created.
- [x] Existing docs updated earlier for NestJS backend-first direction.

### Known Limitations

- Database push/seed not verified yet because local Postgres is not configured.
- API-key guard is not implemented yet.
- Agents/numbers modules are not implemented yet.

### Next Actions

- Implement API-key guard and project scope resolver.
- Implement agents module.
- Implement numbers module.

## 2026-05-06: Phase 1 Slice 2 - API Foundation, Agents, And Numbers

Status: review

### Scope Completed

- [x] API-key guard.
- [x] Request context decorator.
- [x] Agents module.
- [x] Mock provider module.
- [x] Numbers module.
- [x] Unit/service tests.

### Architecture Review

- [x] Module boundaries are clear.
- [x] Controllers are thin.
- [x] Services own business logic.
- [x] Provider-specific logic is isolated.
- [x] Public API responses are provider-neutral.
- [x] No frontend code was added to backend repo.

### Code Quality Review

- [x] Names are clear.
- [x] Files have single responsibility.
- [x] No dead code or dead folders remain.
- [x] No secrets are committed.
- [x] No generated build output is tracked.

### API Review

- [x] Routes match current Phase 1 plan.
- [x] Response shape uses `{ data }`.
- [x] Error shape uses `{ error: { code, message, details } }`.
- [x] Auth behavior is implemented.
- [x] Workspace/project scope is attached from API key.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`

### Docs And Tracking

- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.
- [x] `docs/PHASE_1_STATUS.md` updated.

### Known Limitations

- DB-backed integration tests still need a configured Postgres database.
- Usage event creation for number allocation is deferred until the usage module exists.
- Workspace/team/invites/audit foundation was found missing during review and has now been implemented as Slice 3.

### Next Actions

- Configure local Postgres and verify `db:push`/`db:seed`.
- Implement contacts, conversations, and messages.
- Add early webhook event hooks.

## 2026-05-06: Phase 1 Slice 3 - Workspace, Team, Invites, And Audit

Status: review

### Scope Completed

- [x] Global user identity model.
- [x] Workspace members.
- [x] Workspace invites.
- [x] Audit events.
- [x] Workspace/team/invite routes.
- [x] Tests for audit, invite token hashing, and last-owner protection.

### Architecture Review

- [x] Module boundaries are clear.
- [x] Controllers are thin.
- [x] Services own business logic.
- [x] Provider-specific logic is isolated from this slice.
- [x] Public API responses are provider-neutral.
- [x] No frontend code was added to backend repo.

### Code Quality Review

- [x] Names are clear.
- [x] Files have single responsibility.
- [x] No dead code or dead folders remain.
- [x] No secrets are committed.
- [x] No generated build output is tracked.

### API Review

- [x] Routes are documented in `docs/BACKEND_SPEC.md`.
- [x] Response shape uses `{ data }`.
- [x] Error shape uses `{ error: { code, message, details } }`.
- [x] Auth behavior uses API-key guard.
- [x] Workspace scope is respected.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`

### Docs And Tracking

- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.
- [x] `docs/` updated.

### Known Limitations

- Google SSO/session auth is deferred.
- Invite email delivery is deferred.
- DB-backed integration tests still need Postgres.

### Next Actions

- Implement contacts, conversations, and messages.
- Add early webhook message event hooks.

## 2026-05-07: Phase 1 Slice 4 - Messages, Conversations, And Internal Events

Status: review

### Scope Completed

- [x] Contacts helper.
- [x] Conversation helper.
- [x] Outbound mock SMS.
- [x] Inbound SMS simulation.
- [x] Internal message events.
- [x] Service tests.

### Architecture Review

- [x] Module boundaries are clear.
- [x] Controllers are thin.
- [x] Services own business logic.
- [x] Provider-specific logic is isolated.
- [x] Public API responses are provider-neutral.
- [x] No frontend code was added to backend repo.

### Code Quality Review

- [x] Names are clear.
- [x] Files have single responsibility.
- [x] No dead code or dead folders remain.
- [x] No secrets are committed.
- [x] No generated build output is tracked.

### API Review

- [x] Routes match `docs/BACKEND_SPEC.md`.
- [x] Response shape uses `{ data }`.
- [x] Error shape uses `{ error: { code, message, details } }`.
- [x] Auth behavior is correct.
- [x] Workspace/project scope is respected.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`

### Docs And Tracking

- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.
- [x] `docs/` updated.

### Known Limitations

- Full webhook delivery worker is deferred.
- Usage/billing events are deferred.

### Next Actions

- Implement mock calls and transcripts.

## 2026-05-07: Phase 1 Slice 5 - Mock Calls And Transcripts

Status: review

### Scope Completed

- [x] Calls module.
- [x] Mock outbound call route.
- [x] Mock web-call token route.
- [x] Call list/get/end/transfer routes.
- [x] Transcript retrieval routes.
- [x] Summary and outcome fields.
- [x] Internal call events.
- [x] Service tests.

### Architecture Review

- [x] Module boundaries are clear.
- [x] Controllers are thin.
- [x] Services own business logic.
- [x] Provider-specific logic is isolated.
- [x] Public API responses are provider-neutral.
- [x] No frontend code was added to backend repo.

### Code Quality Review

- [x] Names are clear.
- [x] Files have single responsibility.
- [x] No dead code or dead folders remain.
- [x] No secrets are committed.
- [x] No generated build output is tracked.

### API Review

- [x] Routes match `docs/BACKEND_SPEC.md`.
- [x] Response shape uses `{ data }`.
- [x] Error shape uses `{ error: { code, message, details } }`.
- [x] Auth behavior is correct.
- [x] Workspace/project scope is respected.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run db:generate`
- [x] `npm run build`

### Docs And Tracking

- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.
- [x] `docs/` updated.

### Known Limitations

- Real inbound voice routing is deferred.
- Usage/billing events are deferred.

### Next Actions

- Implement webhook endpoint CRUD.
- Implement signed delivery logs and retry simulation.

## 2026-05-07: Phase 1 Slice 6 - Webhooks, Delivery Logs, And Retry Simulation

Status: review

### Scope Completed

- [x] Webhook endpoint CRUD.
- [x] Webhook secret generation.
- [x] HMAC SHA-256 signature helper.
- [x] Signed test delivery records.
- [x] Delivery list filters.
- [x] Retry simulation.
- [x] Internal event delivery bridge.
- [x] Service tests.

### Architecture Review

- [x] Module boundaries are clear.
- [x] Controllers are thin.
- [x] Services own business logic.
- [x] Provider-specific logic is isolated.
- [x] Public API responses are provider-neutral.
- [x] No frontend code was added to backend repo.

### Code Quality Review

- [x] Names are clear.
- [x] Files have single responsibility.
- [x] No dead code or dead folders remain.
- [x] No secrets are committed.
- [x] No generated build output is tracked.

### API Review

- [x] Routes match `docs/BACKEND_SPEC.md`.
- [x] Response shape uses `{ data }`.
- [x] Error shape uses `{ error: { code, message, details } }`.
- [x] Auth behavior is correct.
- [x] Workspace/project scope is respected.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`

### Docs And Tracking

- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.
- [x] `docs/` updated.

### Known Limitations

- Real outbound webhook HTTP dispatch is deferred.
- Queue worker is deferred.
- Usage/billing events are deferred.

### Next Actions

- Implement usage ledger and billing balance simulation.

## 2026-05-07: Phase 1 Slice 7 - Usage Ledger And Billing Balance Simulation

Status: review

### Scope Completed

- [x] Usage pricing constants.
- [x] Usage event creation.
- [x] Billing balance lookup.
- [x] Billing debit helper.
- [x] Usage hooks for numbers, SMS, and calls.
- [x] Daily usage rollup.
- [x] Monthly usage rollup.
- [x] Service tests.

### Architecture Review

- [x] Module boundaries are clear.
- [x] Controllers are thin.
- [x] Services own business logic.
- [x] Provider-specific logic is isolated.
- [x] Public API responses are provider-neutral.
- [x] No frontend code was added to backend repo.

### Code Quality Review

- [x] Names are clear.
- [x] Files have single responsibility.
- [x] No dead code or dead folders remain.
- [x] No secrets are committed.
- [x] No generated build output is tracked.

### API Review

- [x] Routes match `docs/BACKEND_SPEC.md`.
- [x] Response shape uses `{ data }`.
- [x] Error shape uses `{ error: { code, message, details } }`.
- [x] Auth behavior is correct.
- [x] Workspace/project scope is respected.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run db:generate`
- [x] `npm run build`

### Docs And Tracking

- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.
- [x] `docs/` updated.

### Known Limitations

- Stripe, auto-recharge, and invoices are deferred.
- Real provider cost reconciliation is deferred.
- DB-backed integration tests need Postgres.

### Next Actions

- Add Phase 1 API contract examples.
- Add manual smoke-flow guide for frontend and agent integration.

## 2026-05-07: Billing Consistency Hardening And Stripe Plan

Status: review

### Scope Completed

- [x] Billing debit moved before persisted billable domain records.
- [x] Atomic balance debit via conditional update.
- [x] Cumulative spend-limit check.
- [x] Stripe billing plan documented.
- [x] Regression tests added.

### Architecture Review

- [x] Module boundaries are clear.
- [x] Controllers are thin.
- [x] Services own business logic.
- [x] Provider-specific logic is isolated.
- [x] Public API responses are provider-neutral.
- [x] No frontend code was added to backend repo.

### Code Quality Review

- [x] Names are clear.
- [x] Files have single responsibility.
- [x] No dead code or dead folders remain.
- [x] No secrets are committed.
- [x] No generated build output is tracked.

### API Review

- [x] No public route contract changed in this hardening slice.
- [x] Error shape uses `{ error: { code, message, details } }`.
- [x] Auth behavior is unchanged.
- [x] Workspace/project scope is preserved.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`

### Docs And Tracking

- [x] `docs/STRIPE_BILLING_PLAN.md` added.
- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.

### Known Limitations

- Stripe SDK and endpoints are not implemented yet.
- Provider-side compensation is deferred to real telecom integration.

### Next Actions

- Run final verification.
- Continue to API contract examples and smoke-flow docs.

## 2026-05-07: Phase 1 Slice 8 - API Contract Examples And Smoke Flow

Status: review

### Scope Completed

- [x] API examples document.
- [x] Smoke-flow document.
- [x] Project completeness check.
- [x] README/docs index updates.
- [x] Frontend integration notes.
- [x] Stripe plan linked.

### Architecture Review

- [x] No backend behavior changed.
- [x] Documentation matches current API route groups.
- [x] No frontend code was added to backend repo.

### Code Quality Review

- [x] Markdown files are scoped by purpose.
- [x] No secrets beyond local seed development key are introduced.
- [x] No generated build output is tracked.

### API Review

- [x] Examples use `/v1`.
- [x] Examples use `{ data }` response assumptions.
- [x] Auth header is documented.
- [x] Known missing API-key CRUD is documented.

### Testing And Verification

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`

### Docs And Tracking

- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.
- [x] `docs/` updated.

### Known Limitations

- Manual smoke flow still needs a local Postgres database.
- API-key CRUD is not implemented yet.
- Stripe endpoints are planned, not implemented.

### Next Actions

- Implement API-key management CRUD.
- Or implement Stripe endpoints if billing validation becomes the priority.
