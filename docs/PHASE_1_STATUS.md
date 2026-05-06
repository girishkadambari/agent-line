# AgentLine Phase 1 Status

## Current Phase

**Phase 1: Mock Core Product**

Goal: make AgentLine usable locally without Twilio, Telnyx, OpenAI, STT, TTS, Stripe, or real phone credentials.

## Status Legend

- `todo`: not started.
- `in_progress`: currently being implemented.
- `review`: ready for user/Codex review.
- `done`: implemented and verified.
- `blocked`: waiting on a decision or dependency.

## Implementation Tracker

| Step | Status | Notes |
|---|---|---|
| Project scaffold | done | NestJS backend scaffold, open-source files, health route, Jest/Supertest config created and build verified. |
| Database schema | review | Prisma schema for Phase 1 objects created and Prisma client generation verified. DB push/seed still needs a local Postgres URL. |
| Seed data | review | Local workspace, project, API key, agents, webhook, balance seed created. Needs DB push/seed validation. |
| Shared domain types | done | Zod schemas and provider interfaces created. |
| API foundation | review | API-key guard, request context, response/error helpers, exception filter, Zod pipe, Prisma module, auth key utilities created. DB-backed integration needs Postgres. |
| Agents module | review | CRUD, voices, disable behavior, serializers, and service tests implemented. |
| Mock provider | review | Mock number search/provision/release and call/SMS provider contract stubs implemented with tests. |
| Numbers module | review | Provision, attach, detach, release, serializers, and service tests implemented. |
| Workspace/team/invites/audit | review | Global users, memberships, invites, audit events, workspace/team/invite routes, and tests implemented. |
| Messages/conversations module | todo | Outbound SMS, inbound simulation, contact/conversation records. |
| Calls/transcripts module | todo | Mock calls, transcript retrieval, SSE stream. |
| Webhooks module | todo | Endpoint CRUD, signatures, deliveries, retries. |
| Usage/billing module | todo | Usage events, rollups, simulated balance. |
| Frontend integration contract | todo | API examples and contract notes for later React/Lovable frontend integration. |
| Tests/verification | todo | Unit/API tests and manual smoke flow. |

## Review Notes

Add review feedback here as implementation progresses.

- 2026-05-06: User changed backend direction from Next.js to backend-only NestJS. Next.js scaffold was removed and docs were updated.
- 2026-05-06: Initial NestJS scaffold verifies with lint, typecheck, unit tests, Prisma generate, and build.
- 2026-05-06: Slice 2 implemented API-key guard, request context, agents module, mock provider, and numbers module. Verification passed with lint, typecheck, tests, and build.
- 2026-05-06: Review found missing team/invite/audit foundation. Implemented workspace members, invites, audit events, routes, and tests before continuing to messages.

## Next Steps

1. Configure local Postgres and run `npm run db:push && npm run db:seed`.
2. Add DB-backed API integration tests for auth, agents, and numbers once Postgres is available.
3. Implement messages and conversations module.
4. Add early webhook event creation hooks.
