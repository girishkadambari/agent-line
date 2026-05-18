# Vukho Tech Stack Decision

## Decision

Vukho is now **backend-first**.

Use a **NestJS + TypeScript backend** for Phase 1. The React frontend will be created separately later and integrated through the documented REST API.

Recommended default backend stack:

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Backend framework | NestJS |
| Public API | REST under `/v1` |
| Database | PostgreSQL |
| ORM | Prisma |
| API auth | Custom hashed API keys |
| Dashboard auth later | Google SSO in separate React frontend |
| Queue/jobs later | BullMQ + Redis |
| Cache/rate limits later | Redis |
| Realtime/transcript stream | Server-Sent Events first; WebSockets later when required |
| Validation | Zod plus NestJS pipes |
| Testing | Jest + Supertest |
| Telecom provider | Mock provider first, then Twilio adapter, then Telnyx adapter |
| AI provider | Provider adapter interface; add hosted AI later |
| Deployment | Railway for earliest shipping, or Render if predictable fixed services are preferred |
| Database hosting | Neon Postgres or Supabase Postgres |
| Object storage | S3-compatible storage later for recordings |
| Observability | Sentry + structured logs; OpenTelemetry later |
| Payments | Stripe later, simulated billing in Phase 1 |

## Why NestJS For Backend

NestJS is the right backend choice for Vukho now because the product needs a clean, open-source-ready API service with durable module boundaries.

Vukho is backend-heavy:

- API-key authentication
- provider adapters
- agent lifecycle
- phone-number lifecycle
- SMS/call lifecycle
- webhook retries
- usage ledger
- simulated billing
- future workers
- future hosted AI orchestration

NestJS gives this structure without forcing microservices too early.

## Architecture Shape

Use a modular monolith first.

```txt
src/
  common/
    api/
    errors/
    filters/
    pipes/
  domain/
  modules/
    auth/
    prisma/
    health/
    agents/
    numbers/
    messages/
    conversations/
    calls/
    webhooks/
    usage/
    billing/
    providers/
      mock/
      twilio/
      telnyx/
  main.ts
prisma/
docs/
test/
```

Do not build frontend code in this backend repo during Phase 1.

## Backend Approach

Expose API routes as NestJS controllers:

```txt
/v1/health
/v1/agents
/v1/numbers
/v1/messages
/v1/conversations
/v1/calls
/v1/webhooks
/v1/usage
```

Use services for business logic. Controllers should be thin.

Rules:

- Business logic does not live in controllers.
- Provider-specific behavior lives behind provider adapters.
- Public API responses remain provider-neutral.
- Every billable action creates a usage event.
- Webhook deliveries are signed and recorded.
- Mock mode works without external credentials.

## Frontend Strategy

Frontend is separate.

Use `docs/LOVABLE_FRONTEND_PROMPT.md` to generate the React dashboard. After backend Phase 1 is stable, Codex can connect the React app to this NestJS API.

The backend must provide:

- stable request/response contracts
- CORS support
- API examples
- predictable error shapes
- testable mock flows

## Database Choice

Use PostgreSQL with Prisma.

Recommended managed providers:

- Neon for cheap serverless Postgres and low early cost.
- Supabase Postgres if you want more bundled platform features.

Default recommendation: **Neon Postgres + app-owned backend logic**.

## Queue Choice

Use Redis + BullMQ later for:

- webhook retries
- provider callback processing
- transcript summary jobs
- usage rollups
- billing aggregation
- hosted AI background tasks

Do not add queue complexity until the synchronous mock product is working.

## Testing Stack

Use:

- Jest for unit/service tests.
- Supertest for API integration tests.
- Prisma test database or isolated schema for integration tests.

Minimum Phase 1 test coverage:

- health route
- API-key auth
- agents CRUD
- mock number provisioning
- mock SMS flow
- mock call flow
- webhook signing and retry
- usage ledger
- simulated billing

## Deployment Recommendation

Early default:

```txt
Railway + Neon Postgres
```

Alternative:

```txt
Render + Neon Postgres
```

Avoid self-hosting Postgres before funding unless there is a clear reason.

## What Not To Use Early

Avoid these until there is real need:

- Kubernetes
- microservices
- GraphQL
- Kafka
- Temporal
- multi-region databases
- real Twilio/Telnyx before mock mode works
- real hosted AI before call/SMS lifecycles work
- complex billing before real paid usage

## Final Recommendation

Use:

```txt
NestJS + TypeScript + PostgreSQL + Prisma + Jest/Supertest
```

Add later:

```txt
Redis/BullMQ + Twilio/Telnyx + hosted AI provider adapters + Stripe
```

This gives Vukho a clean backend foundation, fast implementation path, and open-source-ready architecture while keeping costs low before funding.
