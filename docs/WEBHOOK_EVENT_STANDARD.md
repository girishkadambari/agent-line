# AgentLine Webhook Event Standard

This document defines the production webhook contract for AgentLine.

## Goals

- Every customer webhook receives a stable envelope.
- Event payloads include enough resource data for consumers to act without extra lookups.
- Endpoint subscriptions support exact and wildcard matching.
- Duplicate provider callbacks must not create duplicate customer webhook events.
- Webhook delivery failures are recorded with retry metadata.

## Event Envelope

Every delivery body uses this shape:

```json
{
  "id": "evt_...",
  "type": "agent.call.completed",
  "apiVersion": "2026-05-13",
  "workspaceId": "ws_...",
  "projectId": "proj_...",
  "createdAt": "2026-05-13T08:00:00.000Z",
  "resource": {
    "type": "call",
    "id": "call_..."
  },
  "data": {}
}
```

`data` is event-specific and must always include the primary business identifiers such as `agentId`, `conversationId`, and the resource ID.

## Subscription Matching

Webhook endpoint `events` support:

- Exact event names, for example `agent.message.sent`
- Prefix wildcard names ending in `.*`, for example `agent.message.*` or `agent.call.*`
- Global wildcard `*`

## Event Families

### Messages

- `agent.message.sent`
- `agent.message.received`
- `agent.message.delivery_updated`

Message payloads include:

- `agentId`
- `messageId`
- `conversationId`
- `contactId`
- `phoneNumberId`
- `direction`
- `body`
- `status`
- `provider`
- `providerMessageId`
- `createdAt`
- `updatedAt`

### Calls

- `agent.call.started`
- `agent.call.status_updated`
- `agent.call.completed`
- `agent.call.ended`
- `agent.call.transferred`
- `agent.call.transcript_updated`

Call payloads include:

- `agentId`
- `callId`
- `conversationId`
- `contactId`
- `phoneNumberId`
- `direction`
- `fromNumber`
- `toNumber`
- `status`
- `outcome`
- `summary`
- `durationSeconds`
- `provider`
- `providerCallId`
- `startedAt`
- `endedAt`

Transcript update payloads also include `transcriptTurn`.

## Delivery Rules

- Webhooks are signed with AgentLine headers.
- Failed deliveries keep `lastStatusCode`, `lastError`, and `nextAttemptAt`.
- Provider callback duplicates are ignored before customer webhook emission.
- Customer endpoints should treat `id` as the idempotency key.

