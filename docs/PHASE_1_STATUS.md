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
| API-key management | review | API keys can be listed, created with one-time raw key return, updated, revoked, and audited. |
| Agents module | review | CRUD, voices, disable behavior, serializers, and service tests implemented. |
| Mock provider | review | Mock number search/provision/release and call/SMS provider contract stubs implemented with tests. |
| Numbers module | review | Provision, attach, detach, release, serializers, and service tests implemented. |
| Workspace/team/invites/audit | review | Global users, memberships, invites, audit events, workspace/team/invite routes, and tests implemented. |
| Messages/conversations module | review | Contacts, conversations, outbound SMS, inbound SMS simulation, message records, and internal message events implemented. |
| Calls/transcripts module | review | Mock outbound calls, web-call token, list/get/end/transfer routes, transcript retrieval, summaries, outcomes, and internal call events implemented. |
| Webhooks module | review | Endpoint CRUD, HMAC signatures, test delivery, delivery logs, retry simulation, and internal event delivery bridge implemented. |
| Usage/billing module | review | Usage events, pricing constants, billing balance lookup/debit, SMS/call/number hooks, and daily/monthly rollups implemented. |
| Stripe billing endpoints | review | Checkout sessions, portal sessions, verified webhook, billing accounts, and billing transactions implemented. |
| Docker Postgres | review | Docker Compose dev/test Postgres services and `.env.test.example` added. |
| Provider abstraction | review | Mock and Twilio adapters now resolve through a shared `TELECOM_PROVIDER` token. |
| DB-backed e2e smoke | review | Golden Phase 1 Supertest flow added for Docker test Postgres. |
| Twilio SMS safety prep | review | Provider-safe billing order, callback URLs, inbound/status callback routes, raw provider events, and hidden provider IDs implemented. |
| Frontend integration contract | review | API examples, smoke flow, frontend integration notes, and completeness check added. |
| Tests/verification | review | Lint, typecheck, unit tests, build, Docker schema push, and DB-backed e2e smoke pass. |

## Review Notes

Add review feedback here as implementation progresses.

- 2026-05-06: User changed backend direction from Next.js to backend-only NestJS. Next.js scaffold was removed and docs were updated.
- 2026-05-06: Initial NestJS scaffold verifies with lint, typecheck, unit tests, Prisma generate, and build.
- 2026-05-06: Slice 2 implemented API-key guard, request context, agents module, mock provider, and numbers module. Verification passed with lint, typecheck, tests, and build.
- 2026-05-06: Review found missing team/invite/audit foundation. Implemented workspace members, invites, audit events, routes, and tests before continuing to messages.
- 2026-05-07: Slice 4 implemented contacts, conversations, messages, inbound SMS simulation, and durable internal message events.
- 2026-05-07: Slice 5 implemented mock calls, transcript turns, web-call token route, call end/transfer actions, and durable internal call events.
- 2026-05-07: Slice 6 implemented webhook endpoints, signed test deliveries, delivery logs, retry simulation, and pending deliveries for matching message/call events.
- 2026-05-07: Slice 7 implemented usage ledger, billing balance simulation, debits for numbers/SMS/calls, and usage rollups.
- 2026-05-07: Slice 8 added API examples, local smoke flow, frontend integration notes, Stripe plan reference, and Phase 1 completeness check.
- 2026-05-07: Slice 9 implemented API-key management CRUD with one-time raw key return, hash-only storage, revocation, and audit events.
- 2026-05-07: Slice 10 implemented Stripe checkout, portal, webhook verification, billing accounts, and billing transactions.
- 2026-05-07: Slice 11 added Docker Postgres, DB-backed Phase 1 smoke e2e, provider selection token, Twilio adapter prep, and verified the flow against Docker test Postgres.
- 2026-05-07: Phase 2A implemented Twilio SMS safety prep: billing before live writes, callback URLs, inbound/status callback ingestion, raw event idempotency, and hidden provider IDs.

## Next Steps

1. Add Twilio callback signature verification.
2. Add outbound SMS rate limits and abuse protection.
3. Add 10DLC/compliance fields for real SMS.
4. Run bounded live-provider verification with Twilio sandbox credentials.
