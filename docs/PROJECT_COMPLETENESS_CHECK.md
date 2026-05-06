# AgentLine Project Completeness Check

This document answers: "Are the complete project-related things implemented for Phase 1?"

## Phase 1 Product Loop

| Area | Status | Notes |
|---|---|---|
| Backend scaffold | complete | NestJS backend-only repo with lint, typecheck, Jest, Prisma, and build scripts. |
| Open-source readiness | complete | License, contributing guide, code of conduct, README, docs, and tracking are present. |
| Workspace/project scope | complete | API keys resolve workspace/project context and can be listed, created, updated, and revoked. |
| Team/invites/audit | complete for Phase 1 | Workspace members, invites, audit events, and routes exist. Google SSO/session auth is deferred. |
| Agents | complete for Phase 1 | CRUD, voices, status handling, prompt fields, and modes exist. |
| Numbers | complete for Phase 1 | Mock provisioning, attach/detach, release, usage debit. |
| Messages/conversations | complete for Phase 1 | Outbound SMS, inbound simulation, contacts, conversations, messages, usage, events, webhooks. |
| Calls/transcripts | complete for Phase 1 | Mock outbound calls, web-call token, transcript list/SSE, end/transfer, usage, events, webhooks. |
| Webhooks | complete for Phase 1 | Endpoint CRUD, signing, test delivery, delivery logs, retry simulation, internal event bridge. |
| Usage/billing | complete for Phase 1 | Usage ledger, daily/monthly rollups, balance lookup/debit, mock spend controls. |
| Stripe plan | planned | Stripe architecture is documented. SDK/endpoints are intentionally deferred. |
| Frontend | separate | Frontend will be generated separately in Lovable/React and integrated with this API. |
| Real telecom | deferred | Twilio/Telnyx starts in later roadmap phases. |
| Hosted AI | deferred | Hosted STT/TTS/LLM orchestration starts after real voice foundation. |

## What Is Implemented

- Health route.
- API-key authentication.
- API-key management CRUD.
- Workspace, team, invites, audit.
- Agents.
- Mock numbers.
- Contacts.
- Conversations.
- Messages.
- Inbound SMS simulation.
- Calls.
- Transcript turns and SSE stream.
- Internal events.
- Webhooks and deliveries.
- Usage ledger.
- Billing balance simulation.
- Stripe billing plan.
- Phase tracking.
- API examples.
- Smoke flow.

## Important Deferred Items

These are not missing from Phase 1; they are intentionally later:

- Real Twilio/Telnyx number buying and SMS.
- Real inbound/outbound voice.
- Real webhook HTTP delivery worker.
- Stripe Checkout, Customer Portal, and Stripe webhook endpoints.
- Google SSO/session auth.
- Hosted AI agents.
- SDKs, CLI, and MCP server.
- Production abuse detection and compliance dashboard.

## Current Engineering Risks

- DB-backed e2e coverage is blocked until local Postgres is configured.
- Mock provider behavior is deterministic and useful, but not provider-realistic.
- Usage/billing is internally consistent for Phase 1 but not a replacement for Stripe or provider reconciliation.
- The backend has no frontend yet by design.

## Recommended Next Work

1. Run a DB-backed smoke flow locally.
2. Add API-key CRUD routes if the frontend needs dashboard API-key management.
3. Implement Stripe checkout/portal/webhook endpoints.
4. Add real provider adapter interfaces for Twilio/Telnyx.
5. Add SDK/client generation after API contracts stabilize.
