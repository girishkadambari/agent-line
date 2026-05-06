# AgentLine Implementation Plan

## Current Phase

AgentLine is in **Phase 1: Mock Core Product**.

The implementation direction is now **backend-only NestJS first**. The React frontend will be built separately later and integrated through the REST API.

## Implementation Strategy

Build a modular NestJS backend monolith.

Use:

- NestJS
- TypeScript
- PostgreSQL
- Prisma
- Zod
- Jest
- Supertest
- Redis + BullMQ later

Phase 1 must not require Twilio, Telnyx, OpenAI, STT, TTS, Stripe, Redis, or real phone-number credentials. The first product must work fully in mock mode.

## Phase 1 Goal

Build a usable mock AgentLine backend where a developer can:

1. Use a seeded workspace/project.
2. Use a seeded API key.
3. Create an agent.
4. Provision a mock phone number.
5. Attach the number to the agent.
6. Send mock outbound SMS.
7. Simulate inbound SMS.
8. Start mock outbound call.
9. Simulate inbound call.
10. Retrieve call transcript, summary, and outcome.
11. Configure webhook endpoint.
12. Send test webhook.
13. Simulate webhook failure and retry.
14. Retrieve usage and simulated billing balance.

## Build Order

### Step 1: Backend Scaffold

Create the initial backend scaffold.

Required:

- NestJS app.
- TypeScript.
- ESLint.
- Prettier.
- Jest.
- Supertest.
- Prisma.
- Environment config.
- Health route.
- Open-source project files.
- Basic README.

Do not build frontend code in this backend repository.

### Step 2: Database Schema

Implement Prisma schema for:

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

Rules:

- Use AgentLine IDs as primary IDs.
- Store provider IDs as secondary fields.
- Use workspace/project scoping.
- Use UTC timestamps.
- Make usage events append-only.
- Do not hard-delete history records.

### Step 3: Shared Domain Types And Validation

Create shared TypeScript/Zod schemas for:

- request bodies
- response objects
- resource states
- webhook payloads
- provider adapter inputs/outputs

### Step 4: API Foundation

Implement:

- response wrapper `{ data }`
- list wrapper `{ data, pagination }`
- error wrapper `{ error: { code, message, details } }`
- API-key guard
- workspace/project scope resolver
- request validation helper
- pagination helper

### Step 5: Seeded Local Data

Create seed data:

- one workspace
- one project
- one user placeholder
- one owner workspace membership
- one billing balance
- one API key
- sample agents
- sample contacts
- sample webhook endpoint

### Step 6: Workspace, Team, Invites, And Audit Foundation

Implement:

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

Rules:

- `User` is global.
- Workspace access is through `WorkspaceMember`.
- Invite tokens are hashed.
- A workspace must keep at least one active owner.
- State-changing operations should write audit events.

### Step 7: Agents Module

Implement:

- `GET /v1/agents`
- `POST /v1/agents`
- `GET /v1/agents/:id`
- `PATCH /v1/agents/:id`
- `DELETE /v1/agents/:id`
- `GET /v1/agents/voices`
- `POST /v1/agents/:id/numbers`
- `DELETE /v1/agents/:id/numbers/:numberId`

### Step 8: Mock Provider

Implement mock provider behind the provider interface.

Must support:

- search numbers
- provision number
- release number
- send SMS
- create call
- end call
- transfer call
- simulate inbound SMS
- simulate inbound call
- generate transcript turns
- generate summary and outcome
- normalized mock failures

### Step 9: Numbers Module

Implement:

- `GET /v1/numbers`
- `POST /v1/numbers`
- `GET /v1/numbers/:id`
- `PATCH /v1/numbers/:id`
- `DELETE /v1/numbers/:id`

### Step 10: Messages And Conversations Module

Implement:

- `POST /v1/messages`
- `GET /v1/conversations`
- `GET /v1/conversations/:id`
- `PATCH /v1/conversations/:id`
- `GET /v1/conversations/:id/messages`
- `POST /v1/messages/:id/reactions`
- mock inbound SMS simulation endpoint

### Step 11: Calls And Transcripts Module

Implement:

- `POST /v1/calls`
- `POST /v1/calls/web`
- `GET /v1/calls`
- `GET /v1/calls/:id`
- `POST /v1/calls/:id/end`
- `POST /v1/calls/:id/transfer`
- `GET /v1/calls/:id/transcript`
- `GET /v1/calls/:id/transcript/stream`
- mock inbound call simulation endpoint

### Step 12: Webhooks Module

Implement:

- `GET /v1/webhooks`
- `POST /v1/webhooks`
- `PATCH /v1/webhooks/:id`
- `DELETE /v1/webhooks/:id`
- `GET /v1/webhooks/deliveries`
- `POST /v1/webhooks/:id/test`

### Step 13: Usage And Billing

Implement:

- `GET /v1/usage`
- `GET /v1/usage/daily`
- `GET /v1/usage/monthly`
- simulated billing balance debit behavior

### Step 14: Frontend Integration Contract

Create backend docs/examples for the future React frontend:

- route list
- auth header examples
- request/response JSON examples
- error response examples
- CORS assumptions
- seeded local API key

Do not build frontend code here.

### Step 15: Verification

Run:

- typecheck
- lint
- unit tests
- API integration tests

Manual smoke flow:

1. Start NestJS API locally.
2. Use seeded API key.
3. Create agent.
4. Provision number.
5. Send SMS.
6. Simulate inbound SMS.
7. Start call.
8. Retrieve transcript.
9. Create webhook.
10. Test webhook.
11. Retrieve usage.

## AI Agent Task Breakdown

### Task A: Backend Scaffold

Set up NestJS, TypeScript, Prisma, Jest, Supertest, linting, env config, open-source project files, and basic app structure.

### Task B: Database

Implement Prisma schema, migrations, and seed data for Phase 1 objects.

### Task C: API Foundation

Implement auth guard, response/error helpers, validation helper, and project scope resolver.

### Task D: Agents And Numbers

Implement agents routes, numbers routes, and mock provider number behavior.

### Task E: Messages And Conversations

Implement outbound SMS, inbound SMS simulation, conversations, contacts, message records, usage, and webhooks.

### Task F: Calls And Transcripts

Implement outbound/inbound mock calls, transcript turns, summaries, outcomes, SSE transcript stream, usage, and webhooks.

### Task G: Webhooks

Implement endpoint CRUD, signing, delivery attempts, retries, test event, and failure simulation.

### Task H: Usage And Billing

Implement usage ledger, balance debits, daily/monthly rollups, filters, and tests.

### Task I: Frontend Integration Contract

Document request/response examples and API assumptions for the separate React frontend.

## Definition Of Phase 1 Done

Phase 1 is done when:

- NestJS API runs locally without real external credentials.
- All Phase 1 routes exist and match `BACKEND_SPEC.md`.
- Mock provider supports SMS, calls, numbers, transcripts, and failures.
- Webhooks are signed, recorded, and retryable.
- Usage and simulated billing are visible through API.
- API can complete the mock product journey.
- Tests cover core flows.
- Docs are updated to reflect implementation decisions.
