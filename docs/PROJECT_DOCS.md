# AgentLine Project Documentation

## Purpose

This document is the engineering source of truth for how AgentLine should be implemented. Product decisions belong in `PRODUCT_SPEC.md`. Build sequencing belongs in `ROADMAP.md`. Backend route and service requirements belong in `BACKEND_SPEC.md`.

AgentLine should be built so human engineers and AI coding agents can work from clear contracts without inventing product behavior.

## Project Definition

AgentLine is an API-first platform for AI-agent phone infrastructure. It lets developers create agents, assign phone numbers, send and receive SMS, make and receive calls, inspect transcripts, receive webhooks, track usage, and eventually run hosted AI conversations.

## Glossary

| Term | Meaning |
|---|---|
| Agent | Configured AI persona or webhook-backed worker that handles calls/messages. |
| Hosted mode | AgentLine runs AI conversation logic using prompt, model, STT, and TTS configuration. |
| Webhook mode | Customer backend receives events and returns instructions/responses. |
| Web mode | Browser-based calling/testing mode without PSTN dependency. |
| Provider | Telecom vendor such as Twilio or Telnyx. |
| Conversation | Thread of interaction between an agent and a contact across SMS and voice. |
| Transcript turn | One speaker turn in a call transcript. |
| Usage event | Internal metered record for billing and analytics. |
| Webhook delivery | Attempt to send a signed AgentLine event to a customer endpoint. |

## Local Development Assumptions

- Build mock mode first.
- The app must run locally without telecom credentials.
- Provider-specific behavior must sit behind provider adapters.
- Domain records must use AgentLine IDs, not provider IDs as primary identifiers.
- Raw provider payloads must be stored separately from normalized domain records.
- Every billable operation must create a usage event.
- Every external event should be idempotent.

## Suggested Architecture

Use these subsystems:

- API server: exposes `/v1` REST API and dashboard API.
- Dashboard: web UI for product operation and inspection.
- Datastore: stores normalized AgentLine objects.
- Provider adapters: mock, Twilio, Telnyx.
- Webhook worker: signs, sends, retries, and records webhook deliveries.
- Usage ledger: records billable events and supports reporting.
- Billing service: tracks balance, spend limits, and future invoices.
- Event bus/internal queue: connects calls, messages, usage, webhooks, and dashboard updates.

## Module Boundaries

| Module | Responsibility |
|---|---|
| `auth` | API-key auth, user/session auth, permissions. |
| `workspaces` | Current workspace profile, members, invites, and workspace settings. |
| `audit` | Append-only audit events for security-relevant and state-changing actions. |
| `agents` | Agent CRUD, modes, prompt settings, voice settings. |
| `numbers` | Number provisioning, capabilities, attachment, release. |
| `messages` | SMS/MMS send/receive and provider callbacks. |
| `conversations` | Contact-agent threads across channels. |
| `calls` | Call creation, lifecycle, transcript, summary, outcome. |
| `webhooks` | Event subscriptions, signatures, delivery attempts, retries. |
| `usage` | Metering, rollups, cost attribution. |
| `billing` | Balance, spend limits, recharge state, invoices later. |
| `providers` | Mock/Twilio/Telnyx adapters and provider event normalization. |
| `dashboard` | UI routes, admin views, playground, charts. |

## Provider Strategy

### Phase 1: Mock Provider

Mock provider must support:

- Provisioning deterministic fake numbers.
- Sending mock SMS.
- Simulating inbound SMS.
- Starting mock outbound calls.
- Simulating inbound calls.
- Producing transcript turns.
- Producing call summaries and outcomes.
- Producing provider-like error states for testing.

### Later Phases: Twilio/Telnyx Providers

Real providers must be added behind the same adapter interface used by mock mode.

Provider adapters must:

- Normalize external states into AgentLine states.
- Record raw payloads for debugging.
- Return typed provider errors.
- Avoid leaking provider-specific fields into public API responses unless placed under a clearly named `provider` object.

## Data Persistence Strategy

Start simple for MVP, but keep the data model ready for production.

Rules:

- Use AgentLine IDs for all primary records.
- Store provider IDs as secondary fields.
- Use `workspaceId` and `projectId` on records that need tenant scoping.
- Treat `User` as a global identity and `WorkspaceMember` as workspace access.
- Store timestamps in ISO 8601 UTC.
- Keep normalized records separate from raw provider payloads.
- Store usage events append-only.
- Do not delete financial or usage records in normal app flows.

## Webhook Rules

Webhook events must be reliable, signed, and inspectable.

Requirements:

- Every event has a stable `eventId`.
- Every delivery has a stable `deliveryId`.
- Every endpoint has a secret.
- Payloads are signed using HMAC SHA-256.
- Failed deliveries are retried.
- Delivery attempts are visible in the dashboard.
- Customers can test an endpoint from the dashboard.
- Customers can replay a failed event later.

Default retry schedule:

- Immediately
- 5 minutes
- 30 minutes
- 2 hours
- 6 hours
- 12 hours

## Usage And Billing Rules

Usage must be tied to value and cost.

Billable events:

- Phone number monthly allocation.
- SMS sent.
- SMS received if pricing requires it.
- Voice call minute in webhook mode.
- Voice call minute in hosted mode.
- Recording storage/add-on.
- Future advanced features such as PII redaction, evaluations, and knowledge base lookup.

Usage events must include:

- `workspaceId`
- `projectId`
- `agentId` when applicable
- `resourceType`
- `resourceId`
- `channel`
- `quantity`
- `unit`
- `unitCost`
- `totalCost`
- `occurredAt`

## Dashboard Design Principles

- Show operational state first.
- Make failures visible.
- Avoid decorative pages that do not help the user operate agents.
- Every major resource list should have search, filters, status, and empty states.
- Every call should link to transcript, summary, usage, and webhook events.
- Every conversation should show the agent, contact, channel, and last activity.
- Playground actions should create real records in mock mode so developers can inspect behavior.

## Security Requirements

- API keys are only shown once after creation.
- Store API keys hashed, never plaintext.
- Support key labels and last-used metadata.
- Scope API keys to workspace/project.
- Require webhook signature verification helpers in SDKs.
- Apply rate limits before expensive provider/AI calls.
- Log security-relevant events in audit logs.

## Workspace, Team, Invites, And Audit

Rules:

- `User` is global.
- `WorkspaceMember` connects a user to a workspace.
- `WorkspaceInvite` represents invited users before acceptance.
- Invite tokens are hashed at rest.
- A workspace must always have at least one active owner.
- Audit events are append-only.
- State-changing services should record audit events or explicitly document why they do not.

## Compliance Requirements

Initial compliance scope is US/Canada.

Track these fields even before full compliance automation exists:

- Recording consent mode.
- SMS opt-out state.
- 10DLC/campaign status.
- Data retention policy.
- BAA/HIPAA status for workspace.
- Provider compliance status.

AgentLine must not claim compliance until legal and provider setup support it.

## Documentation Rules

- Product decisions go in `PRODUCT_SPEC.md`.
- Roadmap and sequencing go in `ROADMAP.md`.
- Engineering/project conventions go in this file.
- Backend/API details go in `BACKEND_SPEC.md`.
- Keep docs implementation-oriented.
- Avoid vague phrases like "integrate AI" without naming the component, flow, and expected output.
- When behavior changes, update the corresponding source-of-truth doc in the same development task.

## Testing Strategy

Required test categories:

- Unit tests for domain logic.
- API tests for core routes.
- Provider adapter contract tests.
- Webhook signing tests.
- Webhook retry tests.
- Usage ledger tests.
- Billing balance tests.
- Dashboard smoke tests.
- Error-state tests for invalid provider responses.

No phase is complete unless its exit criteria can be verified by tests or repeatable manual flows.
