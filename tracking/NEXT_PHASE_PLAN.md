# AgentLine Next Phase Plan

## Current Focus

**Phase 1 Hardening: DB-Backed E2E Tests**

The mock product loop, API-key management, Stripe billing endpoints, and Stripe webhook hardening are implemented. The next best phase is to prove the whole system against a real Postgres database.

## Goals

- Run the golden smoke flow through HTTP API tests.
- Verify seeded workspace/project/API key.
- Verify auth, agents, numbers, messages, calls, webhooks, usage, billing, API-key CRUD, and Stripe webhook idempotency.
- Catch Prisma/schema/runtime issues that unit tests cannot catch.

## Build

- Configure a test database URL.
- Add e2e setup/teardown.
- Seed test data.
- Add Supertest flows for:
  - health.
  - authenticated workspace scope.
  - API-key create/revoke.
  - agent create.
  - number provision.
  - outbound SMS.
  - inbound SMS simulation.
  - mock call.
  - webhook endpoint/test delivery.
  - usage and billing balance.
  - Stripe webhook credit idempotency with mocked provider/signature.

## Alternative Next Track

Real provider prep:

- Twilio/Telnyx adapter contract tests.
- normalized provider errors.
- provider raw event ingestion skeleton.

## Current Recommendation

Implement **DB-Backed E2E Tests** next before touching real telecom.
