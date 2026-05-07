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

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`

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

## 2026-05-07: Phase 1 Slice 9 - API-Key Management CRUD

Status: review

### Scope Completed

- [x] List API keys.
- [x] Create API key.
- [x] Update API key.
- [x] Revoke API key.
- [x] Raw key returned only once.
- [x] Key hash never serialized.
- [x] Audit events recorded.
- [x] Service tests added.

### Architecture Review

- [x] Auth module owns API-key management.
- [x] Controllers are thin.
- [x] Services own business logic.
- [x] Public responses are provider-neutral.
- [x] No frontend code was added to backend repo.

### Code Quality Review

- [x] Names are clear.
- [x] Files have single responsibility.
- [x] No secrets are committed.
- [x] No generated build output is tracked.

### API Review

- [x] Routes match `docs/BACKEND_SPEC.md`.
- [x] Response shape uses `{ data }`.
- [x] Auth behavior is correct.
- [x] Workspace/project scope is respected.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [ ] `npm test`
- [x] `npm run build`

### Docs And Tracking

- [x] `docs/API_EXAMPLES.md` updated.
- [x] `docs/BACKEND_SPEC.md` updated.
- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.

### Known Limitations

- Role-based permissions are not enforced yet.
- DB-backed API e2e tests still need Postgres.

### Next Actions

- Implement Stripe billing endpoints or DB-backed e2e tests.

## 2026-05-07: Phase 1 Slice 10 - Stripe Billing Endpoints

Status: review

### Scope Completed

- [x] Checkout session endpoint.
- [x] Portal session endpoint.
- [x] Stripe webhook endpoint.
- [x] Billing transactions endpoint.
- [x] Billing account model.
- [x] Billing transaction model.
- [x] Webhook signature verification.
- [x] Stripe event idempotency.
- [x] Balance credit on checkout completion.
- [x] Service tests.

### Architecture Review

- [x] Stripe access is behind provider wrapper.
- [x] Controllers are thin.
- [x] Services own business logic.
- [x] Usage ledger remains product source of truth.
- [x] No frontend code was added to backend repo.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run db:generate`
- [x] `npm run build`

### Docs And Tracking

- [x] `docs/API_EXAMPLES.md` updated.
- [x] `docs/BACKEND_SPEC.md` updated.
- [x] `docs/STRIPE_BILLING_PLAN.md` updated.
- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.

### Known Limitations

- Stripe SDK is not installed; HTTP wrapper is used.
- Live Stripe behavior still needs real credentials and manual sandbox verification.
- DB-backed e2e tests are still pending.

### Next Actions

- Implement DB-backed e2e tests.

## 2026-05-07: Stripe Webhook Hardening

Status: review

### Scope Completed

- [x] Atomic checkout completion credit.
- [x] Unique Stripe event constraint.
- [x] Duplicate event guard.
- [x] Unscoped event ignore behavior.
- [x] Signature timestamp tolerance.
- [x] Regression tests.

### Architecture Review

- [x] Stripe verification remains in Stripe client wrapper.
- [x] Money movement stays in billing service.
- [x] Balance credit and transaction insert are transaction-bound.

### Testing And Verification

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [x] `npm test`
- [x] `npm run db:generate`
- [ ] `npm run build`

### Docs And Tracking

- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.

### Known Limitations

- Live Stripe sandbox verification still needs real credentials.
- DB-backed e2e tests are still pending.

### Next Actions

- Implement DB-backed e2e tests.

## 2026-05-07: Docker Postgres, DB E2E, And Twilio Provider Prep

Status: review

### Scope Completed

- [x] Docker Compose dev/test Postgres services.
- [x] test env example for Docker-backed e2e.
- [x] DB-backed Phase 1 golden smoke e2e test.
- [x] provider selection token.
- [x] mock provider remains default.
- [x] Twilio provider adapter skeleton.
- [x] Twilio provider contract tests.
- [x] docs and tracking updated.

### Architecture Review

- [x] Provider-specific logic is isolated behind `TelecomProvider`.
- [x] Public AgentLine API remains provider-neutral.
- [x] mock mode requires no external credentials.
- [x] Docker DB setup is explicit and repeatable.
- [x] Frontend code remains outside this backend repo.

### Testing And Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run db:test:push`
- [x] `npm run test:e2e:db`

### Docs And Tracking

- [x] `docs/BACKEND_SPEC.md` updated.
- [x] `docs/PROJECT_DOCS.md` updated.
- [x] `docs/SMOKE_FLOW.md` updated.
- [x] `docs/PROJECT_COMPLETENESS_CHECK.md` updated.
- [x] `docs/PHASE_1_STATUS.md` updated.
- [x] `tracking/IMPLEMENTATION_LEDGER.md` updated.
- [x] `tracking/NEXT_PHASE_PLAN.md` updated.

### Known Limitations

- Twilio adapter is not live-tested with real credentials.
- Inbound Twilio SMS/call callbacks are not implemented yet.
- DB-backed e2e requires Docker to be running locally.

### Next Actions

- Start Phase 2 Twilio number and SMS infrastructure.

### Review Findings For Next Phase

- [x] Live provider writes must not happen before billing authorization succeeds.
- [x] Live Twilio provisioning must configure inbound SMS and status callback URLs.
- [x] Public serializers should be reviewed before live provider launch so raw provider IDs do not become accidental public contract fields.

## 2026-05-07: Phase 2A - Twilio Number And SMS Safety

Status: review

### Scope Completed

- [x] Provider-safe billing order for number provisioning.
- [x] Provider-safe local state before outbound SMS.
- [x] Provider-safe local state before outbound calls.
- [x] Usage void/refund helper for failed pre-provider operations.
- [x] Twilio inbound SMS callback URL support during number provisioning.
- [x] Twilio SMS status callback support during send.
- [x] Public Twilio inbound SMS callback endpoint.
- [x] Public Twilio SMS status callback endpoint.
- [x] Provider raw event persistence and idempotency constraints.
- [x] Raw provider IDs removed from public serializers.
- [x] DB-backed e2e extended with Twilio callback simulation.

### Testing And Verification

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run db:generate`
- [x] `npm run build`
- [x] `npm run db:test:push`
- [x] `npm run test:e2e:db`

### Known Limitations

- Twilio live sandbox verification is still pending.
- Voice callbacks and real call lifecycle ingestion remain later.

### Next Actions

- Implement provider timeouts, outbound SMS rate limits, compliance fields, and live sandbox verification.

### Review Findings For Next Phase

- [x] Public Twilio callback routes must verify `X-Twilio-Signature` before processing inbound or status events.
- [x] Duplicate Twilio status callbacks should not emit duplicate internal events or customer webhook deliveries.
- [x] Real voice billing needs a separate preauthorization/finalization model before live voice is enabled.

## 2026-05-07: Phase 2B - Twilio Callback And Voice Billing Hardening

Status: review

### Scope Completed

- [x] Twilio callback signature verifier.
- [x] inbound SMS callback signature verification.
- [x] SMS status callback signature verification.
- [x] signed Twilio callback e2e simulation.
- [x] duplicate callback side-effect suppression.
- [x] voice usage preauthorization.
- [x] voice usage finalization/refund.

### Testing And Verification

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e:db`

### Known Limitations

- Provider request timeout/retry behavior is not implemented yet.
- Outbound SMS rate limits are not implemented yet.
- 10DLC/compliance fields are not implemented yet.
- Twilio sandbox live verification is still pending.

### Next Actions

- Continue Phase 2B with provider timeout/retry, SMS rate limits, compliance fields, and live verification docs.
