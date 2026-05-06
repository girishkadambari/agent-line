# AgentLine Next Phase Plan

## Current Focus

**Phase 1 Backend Slice 6: Webhooks, Delivery Logs, And Retry Simulation**

The backend now has API auth, workspace/team/invites/audit, agents, numbers, messages, conversations, mock calls, transcripts, and durable internal events. The next slice should expose webhook configuration and turn internal events into inspectable signed delivery records.

## Goals

This slice must deliver:

- Webhook endpoint CRUD.
- Webhook secret generation.
- Event subscription filtering.
- Signed test delivery payloads.
- Delivery log records.
- Retry simulation for failed deliveries.
- Delivery list filtering by endpoint/event/status.
- Service tests for signing and delivery state transitions.

## Execution Order

### Step 1: Webhook Signature Helper

- Generate endpoint secrets.
- Sign payloads with HMAC SHA-256.
- Provide timestamped signature headers.
- Add tests for deterministic signing.

### Step 2: Webhooks Module

Implement:

- `GET /v1/webhooks`
- `POST /v1/webhooks`
- `PATCH /v1/webhooks/:id`
- `DELETE /v1/webhooks/:id`
- `POST /v1/webhooks/:id/test`

### Step 3: Delivery Logs

Implement:

- `GET /v1/webhooks/deliveries`
- delivery creation from test events.
- failed delivery simulation.
- retry state update.
- exhausted final state.

### Step 4: Internal Event Bridge

- Add a service method that creates deliveries for matching endpoints from an `InternalEvent`.
- Keep network dispatch mocked in Phase 1.
- Do not perform real outbound HTTP calls yet.

### Step 5: Tests

Add tests for:

- endpoint CRUD.
- endpoint delete disables rather than destroys useful history.
- signature creation.
- test delivery records.
- failed delivery retry simulation.
- workspace/project scoping.

## Definition Of Done

- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run db:generate` passes.
- `npm run build` passes.
- Tracking ledger and review checklist are updated.

## Not In This Slice

- Real outbound webhook HTTP dispatch.
- Background queue worker.
- Usage rollups.
- Billing debits.
- React frontend.
- Real Twilio/Telnyx.
- Hosted AI.
