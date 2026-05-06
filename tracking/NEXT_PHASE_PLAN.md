# AgentLine Next Phase Plan

## Current Focus

**Phase 1 Backend Slice 4: Messages, Conversations, And Webhook Event Hooks**

The backend now has API auth, workspace/team/invites/audit foundation, agents, mock provider, and numbers. The next slice should make the first communication workflow real in mock mode.

## Goals

This slice must deliver:

- Contacts creation/resolution by phone number.
- Conversation creation/resolution.
- Outbound mock SMS.
- Inbound SMS simulation endpoint.
- Message records.
- Early webhook event record creation for message events.
- Service tests for messages/conversations.

## Execution Order

### Step 1: Contacts Helper

- Find or create contact by `projectId + phoneNumber`.
- Scope contacts by workspace/project.
- Keep helper reusable by calls later.

### Step 2: Conversations Helper

- Find or create conversation for `agentId + contactId`.
- Update `lastActivityAt`.
- Default channel to `sms`.
- Avoid duplicate conversations for same agent/contact.

### Step 3: Messages Module

Implement:

- `POST /v1/messages`
- `GET /v1/conversations`
- `GET /v1/conversations/:id`
- `PATCH /v1/conversations/:id`
- `GET /v1/conversations/:id/messages`
- `POST /v1/messages/:id/reactions`
- `POST /v1/simulations/inbound-sms`

### Step 4: Early Webhook Event Hook

Create internal event creation points for:

- `agent.message.sent`
- `agent.message.received`

Full webhook delivery retries can come later.

### Step 5: Tests

Add tests for:

- outbound SMS creates contact, conversation, message.
- outbound SMS requires attached SMS-capable number.
- inbound SMS simulation creates received message.
- conversations list/fetch works.
- messages list for conversation works.
- webhook event hook is called or placeholder event is created.

## Definition Of Done

- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- Tracking ledger and review checklist are updated.

## Not In This Slice

- Calls/transcripts.
- Full webhook retry worker.
- Usage rollups.
- Billing debits.
- React frontend.
- Real Twilio/Telnyx.
- Hosted AI.
