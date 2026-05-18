# Vukho Product Roadmap

## Roadmap Principle

Vukho should be built from the inside out: documentation, domain model, mock product, real providers, hosted AI, developer ecosystem, production safety, then differentiation.

Do not start with a landing page. Do not start with carrier integrations. The first goal is a usable core product that proves the Vukho abstraction before real telecom complexity is introduced.

## Phase 0: Product Foundation And Documentation

**Goal:** Establish the source of truth before building.

**Build and document:**

- Product requirements document.
- Product roadmap.
- Project engineering guide.
- Backend/API requirements.
- Initial API contract.
- Initial data model.
- Initial dashboard map.
- Provider strategy: mock first, Twilio/Telnyx later.

**Exit criteria:**

- Another engineer or AI coding agent can understand what Vukho is, why it exists, who it serves, and what to build first.
- No major product ambiguity remains around core objects, API boundaries, roadmap phases, or initial implementation order.

## Phase 1: Mock Core Product

**Goal:** Make Vukho usable without real telecom.

**Core build:**

- Workspace and project model.
- API-key authentication.
- Agents CRUD.
- Mock phone-number provisioning.
- Attach and detach numbers to agents.
- Mock SMS send and receive.
- Conversation inbox.
- Mock inbound and outbound calls.
- Transcript generation.
- Call summary and structured outcome fields.
- Webhook endpoint configuration.
- Webhook delivery logs and retry simulation.
- Usage ledger.
- Billing balance simulation.
- Dashboard playground.

**Dashboard must support:**

- Create an agent.
- Attach a mock number.
- Send a mock outbound SMS.
- Simulate inbound SMS.
- Simulate inbound/outbound calls.
- View transcript and summary.
- Configure webhook endpoint.
- Trigger test webhook delivery.
- Inspect usage and billing balance.

**Exit criteria:**

- User can create an agent, attach a number, simulate SMS, simulate a call, view transcript, receive webhook events, and inspect usage.
- Product works locally without Twilio, Telnyx, STT, TTS, or LLM credentials.

## Phase 2: Real SMS And Number Infrastructure

**Goal:** Replace mock number and SMS behavior with a real provider adapter.

**Build:**

- Twilio or Telnyx provider adapter.
- Real phone-number search and provisioning.
- Real number release flow.
- Inbound SMS ingestion.
- Outbound SMS.
- SMS delivery status callbacks.
- Provider error normalization.
- Basic abuse protection.
- 10DLC/compliance status fields.
- Provider raw-payload storage.

**Exit criteria:**

- A real phone number can be provisioned, attached to a Vukho agent, and used to send and receive SMS.
- Provider-specific errors are visible in normalized Vukho language.
- Raw provider events are retained for debugging.

## Phase 3: Real Voice Infrastructure

**Goal:** Support real inbound and outbound calls.

**Build:**

- Inbound call routing.
- Outbound call API.
- Call status lifecycle.
- Call recording support.
- Transcript storage.
- Call transfer.
- DTMF support.
- Call end webhooks.
- Browser/web call token endpoint.
- Provider call callback ingestion.

**Exit criteria:**

- Real inbound and outbound calls create call records, transcripts, summaries, usage events, and webhook events.
- Failed, busy, no-answer, canceled, completed, transferred, and timed-out states are represented clearly.

## Phase 4: Hosted AI Agents

**Goal:** Let users run phone agents without building their own backend.

**Build:**

- Hosted voice mode.
- Hosted SMS response mode.
- Agent system prompt execution.
- STT/TTS/LLM orchestration.
- Streaming partial responses.
- Interruption support where provider supports it.
- Summary extraction.
- Structured outcome extraction.
- Agent test console.
- Prompt/version history.

**Exit criteria:**

- User can configure an agent prompt, assign a number, and let the hosted agent handle a complete call or SMS flow.
- Every hosted interaction produces traceable turns, costs, transcript, summary, and outcome.

## Phase 5: Developer Ecosystem

**Goal:** Make Vukho easy to integrate and useful for AI-assisted development.

**Build:**

- TypeScript SDK.
- Python SDK.
- CLI.
- MCP server.
- Webhook signature verification helpers.
- Example apps.
- Local webhook testing guide.
- Public API reference docs.
- Quickstart for mock mode.
- Quickstart for real provider mode.

**Exit criteria:**

- Developer can integrate Vukho from docs and complete a first agent call/SMS flow in under 15 minutes.
- AI coding agents can use docs and MCP tools without guessing route shapes or object meanings.

## Phase 6: Production Safety

**Goal:** Make Vukho safe for bounded paying beta usage.

**Build:**

- Workspace/team roles.
- Rate limits.
- Spend limits.
- Auto-recharge.
- Audit logs.
- Data retention controls.
- Recording consent controls.
- Compliance dashboard.
- Abuse detection.
- Monitoring and alerting.
- Provider failover planning.
- Incident response runbook.

**Exit criteria:**

- Product can support bounded paying beta customers without uncontrolled cost, abuse, compliance ambiguity, or operational blind spots.

## Phase 7: Differentiation

**Goal:** Avoid becoming a commodity telecom wrapper.

**Build:**

- Agent memory across SMS and calls.
- Structured extraction schemas.
- Outcome analytics.
- Conversation search.
- Human handoff workflows.
- Vertical templates.
- BYO Twilio/Telnyx option.
- Enterprise controls.
- Call quality analytics.
- Agent evaluation and regression tests.

**Exit criteria:**

- Customers choose Vukho because it improves agent outcomes, not only because setup is easier.
- The product has defensible workflow data, developer integrations, and operational reliability.

## Phase Dependencies

| Phase | Depends On | Reason |
|---|---|---|
| Phase 1 | Phase 0 | Requires clear domain model and product contract. |
| Phase 2 | Phase 1 | Provider adapters should replace mock behavior behind the same interface. |
| Phase 3 | Phase 2 | Voice depends on provider foundations and lifecycle handling. |
| Phase 4 | Phase 3 | Hosted AI voice depends on real or simulated call media flow. |
| Phase 5 | Phase 1 onward | SDKs and MCP should follow stable API contracts. |
| Phase 6 | Phase 2 onward | Production safety matters once real numbers, messages, calls, and billing exist. |
| Phase 7 | Phase 4 onward | Differentiation depends on real usage and agent interaction data. |

## Business Milestones

- **Milestone A:** Mock MVP proves core agent-number-conversation abstraction.
- **Milestone B:** Real SMS validates provider integration and billing events.
- **Milestone C:** Real voice validates full phone-agent lifecycle.
- **Milestone D:** Hosted mode expands beyond backend-heavy developers.
- **Milestone E:** SDK/MCP ecosystem makes Vukho native to AI development workflows.
- **Milestone F:** Production safety enables paying beta.
- **Milestone G:** Agent memory, outcomes, and templates create long-term defensibility.

## Acceptance Test Scenarios

- Create an agent and update its prompt and mode.
- Provision a mock number and attach it to the agent.
- Send and receive mock SMS.
- Create and inspect a conversation.
- Start and complete a mock outbound call.
- Retrieve transcript and summary.
- Configure webhook endpoint and test signed delivery.
- Simulate webhook failure and retry.
- View usage by agent, channel, day, and month.
- Debit mock billing balance for numbers, SMS, and calls.
- Verify unauthorized requests fail.
- Verify invalid provider states are surfaced clearly.
