# Vukho Webhook Event Standard

This document defines the production webhook contract for Vukho.

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

### Wildcards

- `*`
- `agent.*`
- `agent.call.*`
- `agent.message.*`
- `agent.number.*`
- `agent.conversation.*`
- `agent.contact.*`
- `agent.usage.*`

Wildcard subscriptions are recommended during development. Production
integrations should narrow to the exact families they process.

### Agents

- `agent.created`
- `agent.updated`
- `agent.disabled`

Agent payloads include:

- `agentId`
- `name`
- `description`
- `mode`
- `status`
- `voice`
- `webhookUrl`
- `createdAt`
- `updatedAt`

### Numbers

- `agent.number.provisioned`
- `agent.number.imported`
- `agent.number.attached`
- `agent.number.detached`
- `agent.number.released`
- `agent.number.failed`

Number payloads include:

- `numberId`
- `agentId`
- `phoneNumber`
- `country`
- `areaCode`
- `capabilities`
- `status`
- `provider`
- `createdAt`
- `updatedAt`

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
- `agent.call.failed`
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

### Conversations

- `agent.conversation.created`
- `agent.conversation.updated`

Conversation payloads include:

- `conversationId`
- `agentId`
- `contactId`
- `channel`
- `status`
- `lastActivityAt`
- `createdAt`
- `updatedAt`

### Contacts

- `agent.contact.created`
- `agent.contact.updated`

Contact payloads include:

- `contactId`
- `phoneNumber`
- `displayName`
- `createdAt`
- `updatedAt`

### Usage And Billing

- `agent.usage.recorded`
- `agent.usage.finalized`
- `agent.usage.voided`

Usage payloads include a `usageEvent` object with:

- `id`
- `agentId`
- `resourceType`
- `resourceId`
- `channel`
- `quantity`
- `billableQuantity`
- `unit`
- `unitCost`
- `totalCost`
- `pricingVersion`
- `calculation`
- `evidence`
- `settlementStatus`
- `stripeMeterEventId`
- `occurredAt`
- `createdAt`

## Delivery Rules

- Webhooks are signed with Vukho headers.
- Failed deliveries keep `lastStatusCode`, `lastError`, and `nextAttemptAt`.
- Delivery attempts are claimed before dispatch so concurrent retry workers do
  not send the same attempt twice.
- Automatic retries use bounded backoff: 1 minute, 5 minutes, 15 minutes,
  1 hour, then 3 hours.
- A delivery is marked `exhausted` after 5 failed attempts.
- Manual retry re-sends the stored signed payload to the endpoint.
- Manual replay can re-send a stored delivery payload for debugging or
  downstream recovery.
- Provider callback duplicates are ignored before customer webhook emission.
- Customer endpoints should treat `id` as the idempotency key.
