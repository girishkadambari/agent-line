# AgentLine Backend Specification

## Purpose

This document defines the backend requirements for AgentLine. It should be used by engineers and AI coding agents to implement the API, services, data model, provider adapters, webhooks, usage ledger, and backend behavior without ambiguity.

## Backend Goals

The backend must:

- Expose a versioned REST API under `/v1`.
- Support mock mode without external credentials.
- Keep all public API objects provider-neutral.
- Normalize provider events into AgentLine domain records.
- Create usage events for every billable action.
- Sign and retry customer webhooks.
- Support dashboard operations and playground simulations.
- Prepare for hosted AI mode without requiring it in Phase 1.

## API Standards

### Base URL

```http
/v1
```

### Authentication

All non-public API routes require:

```http
Authorization: Bearer sk_live_xxx
```

API keys must be:

- Stored hashed.
- Scoped to workspace/project.
- Revocable.
- Labelled.
- Tracked with `lastUsedAt`.

### Response Format

Successful single-object response:

```json
{
  "data": {}
}
```

Successful list response:

```json
{
  "data": [],
  "pagination": {
    "limit": 50,
    "nextCursor": null
  }
}
```

Error response:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Human-readable error message.",
    "details": {}
  }
}
```

### Common Error Codes

| Code | Meaning |
|---|---|
| `unauthorized` | Missing or invalid API key. |
| `forbidden` | Authenticated but not allowed. |
| `not_found` | Resource does not exist in scope. |
| `invalid_request` | Validation failed. |
| `provider_error` | Upstream telecom provider failed. |
| `insufficient_balance` | Workspace cannot pay for requested action. |
| `rate_limited` | Request exceeded limits. |
| `conflict` | Resource state does not allow requested action. |

## Domain States

### Phone Number Status

```txt
available
provisioning
active
releasing
released
failed
```

### Message Status

```txt
queued
sending
sent
delivered
failed
received
```

### Call Status

```txt
queued
ringing
in_progress
completed
failed
busy
no_answer
canceled
transferred
```

### Webhook Delivery Status

```txt
pending
succeeded
failed
retrying
exhausted
```

## Data Model Requirements

### Workspace

Required fields:

- `id`
- `name`
- `createdAt`
- `updatedAt`

### User

Required fields:

- `id`
- `email`
- `name`
- `avatarUrl`
- `googleId`
- `createdAt`
- `updatedAt`

Users are global identities. Workspace access is represented by `WorkspaceMember`.

### WorkspaceMember

Required fields:

- `id`
- `workspaceId`
- `userId`
- `role`
- `status`
- `createdAt`
- `updatedAt`

Valid roles:

```txt
owner
admin
developer
billing
viewer
member
```

Valid statuses:

```txt
active
suspended
removed
```

### WorkspaceInvite

Required fields:

- `id`
- `workspaceId`
- `email`
- `role`
- `status`
- `tokenHash`
- `invitedById`
- `acceptedById`
- `expiresAt`
- `acceptedAt`
- `revokedAt`
- `createdAt`
- `updatedAt`

Invite tokens must be hashed at rest. Raw invite tokens are returned only once in local/mock mode until email delivery exists.

### Project

Required fields:

- `id`
- `workspaceId`
- `name`
- `environment`
- `createdAt`
- `updatedAt`

Valid environments:

```txt
test
live
```

### Agent

Required fields:

- `id`
- `workspaceId`
- `projectId`
- `name`
- `mode`
- `systemPrompt`
- `voice`
- `beginMessage`
- `transferNumber`
- `voicemailMessage`
- `webhookUrl`
- `metadata`
- `createdAt`
- `updatedAt`

Valid modes:

```txt
hosted
webhook
web
```

### PhoneNumber

Required fields:

- `id`
- `workspaceId`
- `projectId`
- `agentId`
- `phoneNumber`
- `country`
- `areaCode`
- `capabilities`
- `status`
- `provider`
- `providerNumberId`
- `createdAt`
- `updatedAt`

### Contact

Required fields:

- `id`
- `workspaceId`
- `projectId`
- `phoneNumber`
- `displayName`
- `metadata`
- `createdAt`
- `updatedAt`

### Conversation

Required fields:

- `id`
- `workspaceId`
- `projectId`
- `agentId`
- `contactId`
- `channel`
- `status`
- `lastActivityAt`
- `metadata`
- `createdAt`
- `updatedAt`

Valid channels:

```txt
sms
voice
web
mixed
```

### Message

Required fields:

- `id`
- `workspaceId`
- `projectId`
- `agentId`
- `conversationId`
- `phoneNumberId`
- `contactId`
- `direction`
- `body`
- `status`
- `provider`
- `providerMessageId`
- `createdAt`
- `updatedAt`

Valid directions:

```txt
inbound
outbound
```

### Call

Required fields:

- `id`
- `workspaceId`
- `projectId`
- `agentId`
- `conversationId`
- `phoneNumberId`
- `contactId`
- `direction`
- `fromNumber`
- `toNumber`
- `status`
- `durationSeconds`
- `summary`
- `outcome`
- `recordingId`
- `provider`
- `providerCallId`
- `startedAt`
- `endedAt`
- `createdAt`
- `updatedAt`

### TranscriptTurn

Required fields:

- `id`
- `workspaceId`
- `projectId`
- `callId`
- `speaker`
- `text`
- `startedAtMs`
- `endedAtMs`
- `confidence`
- `createdAt`

Valid speakers:

```txt
agent
user
system
```

### WebhookEndpoint

Required fields:

- `id`
- `workspaceId`
- `projectId`
- `url`
- `secret`
- `events`
- `status`
- `createdAt`
- `updatedAt`

Valid statuses:

```txt
active
paused
disabled
```

### WebhookDelivery

Required fields:

- `id`
- `workspaceId`
- `projectId`
- `endpointId`
- `eventId`
- `eventType`
- `payload`
- `status`
- `attemptCount`
- `lastStatusCode`
- `lastError`
- `nextAttemptAt`
- `createdAt`
- `updatedAt`

### UsageEvent

Required fields:

- `id`
- `workspaceId`
- `projectId`
- `agentId`
- `resourceType`
- `resourceId`
- `channel`
- `quantity`
- `unit`
- `unitCost`
- `totalCost`
- `occurredAt`
- `createdAt`

### AuditEvent

Required fields:

- `id`
- `workspaceId`
- `actorUserId`
- `actorApiKeyId`
- `action`
- `resourceType`
- `resourceId`
- `metadata`
- `ipAddress`
- `userAgent`
- `createdAt`

Audit events are append-only.

## Route Requirements

### Workspace, Team, Invites, And Audit

```http
GET    /v1/workspaces/current
PATCH  /v1/workspaces/current
GET    /v1/workspaces/current/members
PATCH  /v1/workspaces/current/members/:memberId
DELETE /v1/workspaces/current/members/:memberId
GET    /v1/workspaces/current/invites
POST   /v1/workspaces/current/invites
DELETE /v1/workspaces/current/invites/:inviteId
POST   /v1/workspaces/current/invites/:inviteId/resend
GET    /v1/audit-events
```

Rules:

- A workspace must always keep at least one active owner.
- Invite tokens are stored hashed.
- Phase 1 invite resend returns a mock raw token and does not send real email.
- API-key authenticated requests are treated as project-scoped developer actions until Google SSO session auth is implemented.
- State-changing team/workspace operations must write audit events.

### Agents

```http
GET /v1/agents
```

Returns agents scoped to the authenticated project.

```http
POST /v1/agents
```

Creates an agent. Required: `name`, `mode`. Default mode is `webhook`.

```http
GET /v1/agents/:id
```

Returns one agent.

```http
PATCH /v1/agents/:id
```

Updates agent configuration.

```http
DELETE /v1/agents/:id
```

Soft-deletes or disables an agent. Must not delete historical calls/messages.

```http
GET /v1/agents/voices
```

Returns supported voice names for hosted mode.

```http
POST /v1/agents/:id/numbers
```

Provisions or attaches a number to an agent.

### Numbers

```http
GET /v1/numbers
POST /v1/numbers
GET /v1/numbers/:id
PATCH /v1/numbers/:id
DELETE /v1/numbers/:id
```

Number deletion releases the number or marks it released in mock mode. Historical calls/messages remain.

### Messages And Conversations

```http
POST /v1/messages
```

Sends outbound SMS. Required: `agentId`, `to`, `body`.

Backend must:

- Resolve attached agent number.
- Create or update contact.
- Create or update conversation.
- Create message record.
- Send through provider adapter.
- Create usage event once usage ledger is implemented.
- Emit `agent.message.sent`.

```http
GET /v1/conversations
GET /v1/conversations/:id
PATCH /v1/conversations/:id
GET /v1/conversations/:id/messages
POST /v1/messages/:id/reactions
```

Inbound SMS provider callbacks must create `agent.message.received` webhook events.

Phase 1 mock implementation also exposes:

```http
POST /v1/simulations/inbound-sms
```

This creates a received SMS message without requiring a real provider callback.

### Calls

```http
POST /v1/calls
```

Creates outbound call. Required: `agentId`, `to`.

Backend must:

- Resolve attached voice-capable number.
- Create contact and conversation if needed.
- Create call record.
- Start provider call.
- Emit call lifecycle events.
- Create usage event when usage ledger is implemented and call duration is known.

```http
POST /v1/calls/web
```

Creates browser-call token/session.

```http
GET /v1/calls
GET /v1/calls/:id
POST /v1/calls/:id/end
POST /v1/calls/:id/transfer
GET /v1/calls/:id/transcript
GET /v1/calls/:id/transcript/stream
```

Transcript stream uses Server-Sent Events. In mock mode it emits the persisted transcript turns in order.

### Webhooks

```http
GET /v1/webhooks
POST /v1/webhooks
PATCH /v1/webhooks/:id
DELETE /v1/webhooks/:id
GET /v1/webhooks/deliveries
POST /v1/webhooks/:id/test
POST /v1/webhooks/deliveries/:id/retry
```

Test delivery sends a signed `webhook.test` event and records a delivery attempt.
Phase 1 retry simulation updates delivery state locally without performing real outbound HTTP.

### Usage

```http
GET /v1/usage
GET /v1/usage/daily
GET /v1/usage/monthly
GET /v1/billing/balance
```

Usage endpoints must support filtering by:

- `agentId`
- `channel`
- `from`
- `to`

Phase 1 usage creates mock billable events for number provisioning, inbound/outbound SMS, and outbound calls. Billing balance is debited in cents while usage events persist decimal cost fields for future provider reconciliation.

## Provider Adapter Interface

All providers must implement:

```ts
interface TelecomProvider {
  searchNumbers(input: SearchNumbersInput): Promise<SearchNumbersResult>;
  provisionNumber(input: ProvisionNumberInput): Promise<ProvisionNumberResult>;
  releaseNumber(input: ReleaseNumberInput): Promise<ReleaseNumberResult>;
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
  createCall(input: CreateCallInput): Promise<CreateCallResult>;
  endCall(input: EndCallInput): Promise<EndCallResult>;
  transferCall(input: TransferCallInput): Promise<TransferCallResult>;
}
```

Mock provider must implement the same interface as real providers.

## Event And Webhook Flow

Internal flow:

1. Domain action occurs.
2. Backend writes normalized domain record.
3. Backend creates usage event if billable.
4. Backend creates internal event.
5. Webhook worker finds matching endpoints.
6. Worker signs payload.
7. Worker sends delivery.
8. Worker records response.
9. Worker schedules retry if needed.

Webhook payload shape:

```json
{
  "id": "evt_123",
  "type": "agent.call.ended",
  "createdAt": "2026-05-06T00:00:00Z",
  "workspaceId": "ws_123",
  "projectId": "proj_123",
  "data": {}
}
```

## Mock Mode Requirements

Mock mode must be useful, not fake-looking only.

It must:

- Generate stable fake numbers.
- Generate realistic message records.
- Generate call lifecycle transitions.
- Generate transcript turns.
- Generate summary and outcome.
- Exercise webhook delivery and retry paths.
- Create usage events.
- Support dashboard playground.

## Hosted AI Mode Requirements

Hosted mode is not required in Phase 1, but the backend model must prepare for it.

Hosted mode needs:

- Agent prompt.
- Model configuration.
- Voice configuration.
- STT provider configuration.
- TTS provider configuration.
- Conversation memory strategy.
- Tool/action execution later.
- Safety and fallback behavior.

Hosted mode outputs:

- Transcript turns.
- Response text/audio.
- Summary.
- Structured outcome.
- Usage events for LLM/STT/TTS/voice.

## Non-Functional Requirements

### Reliability

- Provider callbacks must be idempotent.
- Webhook events must be retryable.
- Usage events must be append-only.
- Failed provider operations must return normalized errors.

### Security

- Hash API keys.
- Sign webhooks.
- Validate all inbound provider callbacks.
- Rate-limit expensive actions.
- Do not log secrets.

### Observability

- Log every provider request and response metadata.
- Track call lifecycle events.
- Track webhook attempts.
- Track usage creation.
- Expose dashboard-friendly failure messages.

### Compliance

- Track SMS opt-out.
- Track recording consent.
- Track 10DLC status.
- Track data retention policy.
- Avoid claiming HIPAA/PCI compliance until legal/provider configuration supports it.

## Backend Acceptance Criteria

The backend implementation is acceptable when:

- API-key authentication protects all `/v1` routes.
- Agents can be created, listed, updated, and disabled.
- Mock numbers can be provisioned and attached to agents.
- Mock SMS creates messages, conversations, usage, and webhooks.
- Mock calls create calls, transcript turns, summaries, outcomes, usage, and webhooks.
- Webhook deliveries are signed, recorded, and retried.
- Usage endpoints return agent/channel/day/month summaries.
- Provider-specific state does not leak into core domain models.
- All documented route behaviors have tests or repeatable manual verification steps.
