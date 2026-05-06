# AgentLine Product Requirements Document

## 1. Product Identity

**Product name:** AgentLine

**Category:** AI-agent-native phone infrastructure

**One-line positioning:** AgentLine gives AI agents phone numbers, SMS, calls, transcripts, webhooks, usage tracking, and structured outcomes through one developer-first API.

**Core promise:** Developers can give any AI agent real phone presence without building telecom orchestration, speech pipelines, conversation storage, webhook retries, usage accounting, and call/message dashboards from scratch.

**Primary wedge:** Developer API-first product.

**Primary product principle:** AgentLine must be value-first. Every feature should help a developer create, operate, inspect, or improve a real AI phone agent. Avoid generic telecom features unless they make agent outcomes better.

## 2. Product Thesis

Twilio, Telnyx, and similar providers expose communication primitives: phone numbers, calls, SMS, call control, streams, and carrier plumbing. Voice AI platforms expose voice-agent orchestration. AgentLine should sit above raw telecom and below end-user vertical applications.

AgentLine's core abstraction is not the phone call. It is the **agent**.

An agent owns numbers, receives SMS, answers calls, creates transcripts, triggers webhooks, accumulates context, tracks usage, and returns outcomes. This makes AgentLine an operating layer for AI agents that need to interact with the real world over phone and SMS.

The product wins when a developer can go from "I have an AI agent" to "my agent can call and text people safely" in minutes, then scale into real production with logs, retries, billing controls, provider integrations, and compliance workflows.

## 3. Customer And Market Analysis

### Primary Customers

- AI app developers building agents that need real-world communication.
- Automation agencies shipping client workflows around calls, reminders, follow-ups, and support.
- Vertical SaaS teams adding AI calling or texting to existing products.
- AI assistant product teams building personal or business agents.
- AI coding-agent users who want tools that can send SMS, place calls, check transcripts, or provision numbers.

### Initial Use Cases

- Appointment reminders and confirmations.
- Reservation booking and changes.
- Service cancellation calls.
- Insurance, provider, and admin follow-ups.
- Lead qualification calls.
- Customer support triage.
- Order status follow-up.
- Personal assistant calling tasks.
- Missed-call follow-up over SMS.
- Inbound AI receptionist for developer-led products.

### Painkiller Vs Vitamin

AgentLine is a painkiller for AI builders who already need phone/SMS capabilities and do not want to stitch together multiple low-level systems. It is a vitamin for generic businesses that only need a normal phone system or a no-code receptionist.

The strongest initial customer has an urgent job:

- They already have an agent or workflow.
- The workflow requires calling or texting real people.
- The user expects transcripts, state, retries, billing, and inspection.
- Building directly on Twilio/Telnyx would slow them down.

The weakest customer only wants "AI phone calls" with no developer integration, no clear workflow, and no willingness to handle compliance or production details.

## 4. Why AgentLine Is Not A Twilio Clone

Twilio provides powerful communication infrastructure and now has AI voice capabilities such as ConversationRelay. Twilio's abstraction remains communication primitives:

- phone numbers
- calls
- messages
- TwiML
- WebSockets
- webhooks
- media streams
- provider-level logs

AgentLine's abstraction is agent operations:

- agents
- agent-owned phone numbers
- conversations
- call and SMS turns
- transcripts
- summaries
- structured outcomes
- webhook deliveries
- agent-scoped usage
- agent memory
- MCP and SDK tools

### Advantage Over Using Twilio Directly

AgentLine should provide these concrete advantages:

- Faster first agent: create an agent, attach a number, simulate or place a call, and inspect the result.
- Unified voice and SMS context: calls and messages from the same contact belong to one agent-readable conversation history.
- Hosted and webhook modes: beginners can use hosted AI while advanced developers bring their own backend.
- Built-in transcripts and outcomes: every call should end with a transcript, summary, status, and structured result.
- Webhook observability: deliveries, retries, failures, signatures, and replay should be visible from day one.
- Usage by agent: cost and activity should be attributable to each agent, number, channel, and workspace.
- AI development fit: API docs, SDKs, MCP server, examples, and local testing should be designed for AI-assisted development.

AgentLine should use Twilio or Telnyx as infrastructure providers when useful. It should not make the provider the product identity.

## 5. Competitive Landscape

| Product | What It Does | AgentLine Position |
|---|---|---|
| Twilio | Broad communication APIs for voice, messaging, numbers, streams, and contact-center infrastructure. | AgentLine packages communication around agents, state, transcripts, outcomes, and developer-first workflows. |
| Twilio ConversationRelay | AI voice orchestration using STT, TTS, and WebSocket interaction with customer applications. | AgentLine should provide a broader agent object model across numbers, SMS, calls, webhooks, usage, hosted mode, dashboard, and SDKs. |
| Vapi | Developer-first voice AI infrastructure. | AgentLine must differentiate through unified SMS plus voice, number ownership, conversation memory, MCP tools, and backend/provider neutrality. |
| Retell AI | Voice and chat agents with testing, analytics, webhooks, and usage-based pricing. | AgentLine must compete on agent-native API simplicity, transparent data model, provider adapters, and developer ecosystem. |
| Bland | AI phone calling platform focused on call automation and business workflows. | AgentLine should stay infrastructure-first and API-first, not campaign-first. |
| AgentPhone | Closest reference category for phone numbers and communication for AI agents. | AgentLine must be legally distinct and improve through docs, architecture, implementation quality, and focused roadmap. |

## 6. Business Outcomes

AgentLine should optimize for these measurable business outcomes:

- Reduce time to first working phone agent to under 15 minutes for a developer.
- Reduce the amount of custom telecom glue code needed for AI agent products.
- Increase reliability of AI phone workflows through logs, retries, state, and provider-normalized errors.
- Make agent performance inspectable through transcripts, summaries, outcomes, and usage analytics.
- Create usage-based revenue from phone numbers, SMS, voice minutes, hosted AI, recording, and advanced compliance.
- Build defensibility through agent memory, developer ecosystem, MCP integrations, vertical templates, and production safety.

## 7. Product Objects

These are the canonical domain objects for AgentLine.

| Object | Purpose |
|---|---|
| Workspace | Billing, team, and permission boundary. |
| Project | Product/application boundary inside a workspace. |
| User | Human dashboard/API owner. |
| APIKey | Secret used for API authentication. |
| Agent | AI persona or webhook-backed worker that owns phone behavior. |
| PhoneNumber | Real or mock phone number with SMS/voice capabilities. |
| Contact | External person or business the agent communicates with. |
| Conversation | Cross-channel thread between an agent and a contact. |
| Message | SMS/MMS or future chat message event. |
| Call | Voice session with lifecycle, transcript, summary, and outcome. |
| TranscriptTurn | A single speaker turn inside a call. |
| WebhookEndpoint | Customer endpoint subscribed to AgentLine events. |
| WebhookDelivery | Delivery attempt, retry, success, or failure record. |
| UsageEvent | Billable or metered unit of usage. |
| BillingBalance | Credit balance and billing status. |
| Recording | Stored audio artifact and consent metadata. |

## 8. Agent Model

Minimum agent fields:

```json
{
  "id": "agt_123",
  "workspaceId": "ws_123",
  "projectId": "proj_123",
  "name": "Support Agent",
  "description": "Handles customer support calls and SMS.",
  "mode": "hosted",
  "systemPrompt": "You are a helpful support agent.",
  "voice": "alloy",
  "beginMessage": "Hi, how can I help?",
  "transferNumber": "+14155550123",
  "voicemailMessage": "Sorry we missed you.",
  "webhookUrl": "https://example.com/agent-webhook",
  "metadata": {},
  "createdAt": "2026-05-06T00:00:00Z",
  "updatedAt": "2026-05-06T00:00:00Z"
}
```

Valid agent modes:

- `hosted`: AgentLine runs the LLM/STT/TTS conversation.
- `webhook`: AgentLine sends events to the customer's backend and follows returned instructions.
- `web`: Browser call mode for testing or embedded web calls.

## 9. Core Dashboard

The dashboard must make AgentLine usable without requiring the user to read logs or inspect the database.

Required areas:

- Overview: active agents, active numbers, call volume, message volume, spend, failed webhooks.
- Agents: create, edit, test, and inspect agents.
- Numbers: provision, attach, detach, release, and inspect capabilities.
- Inbox: SMS conversations with contacts and agent context.
- Calls: call log, status, transcript, summary, outcome, and recording.
- Contacts: contact identity, phone numbers, history, and metadata.
- Webhooks: endpoints, events, secrets, delivery attempts, retries, and test delivery.
- Usage: daily/monthly usage by agent, project, channel, and billable unit.
- Billing: balance, spend limit, recharge state, invoices placeholder.
- API Keys: create, revoke, label, and view last-used metadata.
- Playground: simulate inbound SMS, outbound SMS, inbound call, outbound call, and webhook delivery.

## 10. Core API Surface

All API routes are versioned under `/v1`.

Authentication:

```http
Authorization: Bearer sk_live_xxx
```

Agents:

```http
GET    /v1/agents
POST   /v1/agents
GET    /v1/agents/:id
PATCH  /v1/agents/:id
DELETE /v1/agents/:id
GET    /v1/agents/voices
POST   /v1/agents/:id/numbers
DELETE /v1/agents/:id/numbers/:numberId
```

Numbers:

```http
GET    /v1/numbers
POST   /v1/numbers
GET    /v1/numbers/:id
PATCH  /v1/numbers/:id
DELETE /v1/numbers/:id
```

Messages and conversations:

```http
POST  /v1/messages
GET   /v1/conversations
GET   /v1/conversations/:id
PATCH /v1/conversations/:id
GET   /v1/conversations/:id/messages
POST  /v1/messages/:id/reactions
```

Calls:

```http
POST /v1/calls
POST /v1/calls/web
GET  /v1/calls
GET  /v1/calls/:id
POST /v1/calls/:id/end
POST /v1/calls/:id/transfer
GET  /v1/calls/:id/transcript
GET  /v1/calls/:id/transcript/stream
```

Webhooks:

```http
GET    /v1/webhooks
POST   /v1/webhooks
PATCH  /v1/webhooks/:id
DELETE /v1/webhooks/:id
GET    /v1/webhooks/deliveries
POST   /v1/webhooks/:id/test
```

Usage:

```http
GET /v1/usage
GET /v1/usage/daily
GET /v1/usage/monthly
```

## 11. Webhook Events

Initial event names:

```txt
agent.message.received
agent.message.sent
agent.call.started
agent.call.turn
agent.call.ended
agent.call.failed
agent.reaction.received
number.provisioned
number.released
webhook.delivery.failed
```

Webhook headers:

```http
X-AgentLine-Webhook-ID: whdel_123
X-AgentLine-Event-ID: evt_123
X-AgentLine-Timestamp: 2026-05-06T00:00:00Z
X-AgentLine-Signature: hmac_sha256(timestamp.body)
```

Webhook delivery rules:

- Include stable event IDs for idempotency.
- Sign every event body with the endpoint secret.
- Store every delivery attempt.
- Retry failed deliveries.
- Show final failed state in the dashboard.

## 12. Pricing Hypothesis

Initial pricing model should be pay-as-you-go:

| Item | Hypothesis |
|---|---:|
| Trial credit | $5 |
| Phone number | $3/month |
| SMS | $0.02/message |
| Voice webhook mode | $0.13/minute |
| Voice hosted mode | $0.22/minute |
| Recording add-on | $5/month |
| Enterprise | custom |

Pricing must be treated as a hypothesis until provider costs, failed call rates, LLM costs, support burden, and compliance requirements are known.

## 13. Risks And Strategy

### Key Risks

- Commodity wrapper risk: competitors can copy basic API features.
- Compliance risk: SMS, 10DLC, consent, call recording, spam, TCPA, HIPAA, and BAA requirements can slow launch.
- Provider dependency: Twilio/Telnyx errors can become AgentLine customer pain.
- Thin margin risk: LLM, TTS, STT, telephony, recording, and support costs stack quickly.
- Demo churn: developers may test once and never move to production.

### Strategic Response

- Build a strong agent-native model, not a telecom wrapper.
- Make inspection and debugging excellent.
- Keep provider adapters replaceable.
- Add MCP, SDKs, and examples early.
- Build usage controls before broad production access.
- Differentiate through memory, outcomes, vertical templates, and reliability.

## 14. Success Metrics

Product success:

- Time to first mock agent call: under 5 minutes.
- Time to first real SMS/call after provider setup: under 15 minutes.
- Webhook failure diagnosis: under 2 minutes from dashboard.
- Every completed call has transcript, summary, outcome, and usage event.
- Every billable action is visible in usage logs.

Business success:

- Developers move from mock mode to real provider mode.
- Production projects retain beyond initial testing.
- Usage grows by agent count and call/message volume.
- Support tickets decrease through better logs and provider error normalization.

## 15. Sources And Reference Context

- AgentPhone public docs: https://docs.agentphone.to/
- Twilio ConversationRelay docs: https://www.twilio.com/docs/voice/conversationrelay
- Twilio ConversationRelay product page: https://www.twilio.com/en-us/products/conversational-ai/conversationrelay
- Retell AI pricing: https://www.retellai.com/pricing
- Vapi docs glossary: https://docs.vapi.ai/glossary
