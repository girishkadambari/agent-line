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

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`

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
