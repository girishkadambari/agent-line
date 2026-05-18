# Vukho AI Development Guide

## Purpose

This guide tells human engineers and AI coding agents how to use the Vukho documentation set during development.

Vukho must be built from the docs. Do not invent product behavior when a documented rule exists.

## Development Order

Follow this order unless the roadmap is updated:

1. Documentation foundation.
2. Mock backend domain model.
3. API-key authentication.
4. Agents CRUD.
5. Mock numbers.
6. Mock SMS and conversations.
7. Mock calls and transcripts.
8. Webhooks and retries.
9. Usage ledger and simulated billing.
10. API playground/simulation endpoints.
11. Real SMS/number provider adapter.
12. Real voice provider adapter.
13. Hosted AI mode.
14. SDKs, CLI, and MCP.
15. Production safety.
16. Differentiation features.

## Rules For AI Coding Agents

- Read `docs/README.md` first.
- Read the relevant spec before editing code.
- Do not create routes that are not in `BACKEND_SPEC.md` unless the docs are updated in the same task.
- Do not build frontend code in the backend repository unless the docs are updated in the same task.
- Use Vukho domain names consistently.
- Keep provider-specific logic behind provider adapters.
- Keep public API responses provider-neutral.
- Create usage events for billable actions.
- Add tests for every implemented route or service behavior.
- Update documentation when behavior changes.

## Implementation Defaults

If a future implementation decision is not specified, use these defaults:

- Start with mock mode.
- Use NestJS controllers and REST under `/v1`.
- Use JSON request and response bodies.
- Use API-key auth for public developer API.
- Use workspace/project scoping on tenant data.
- Use Server-Sent Events for early transcript streaming.
- Use HMAC SHA-256 for webhook signatures.
- Use append-only usage events.
- Use soft deletion for agents and numbers with historical records.

## Definition Of Done For A Feature

A feature is done only when:

- Product behavior matches the relevant doc.
- Backend route/service exists if needed.
- Frontend integration contract exists if UI is deferred.
- Tests or repeatable verification steps exist.
- Error states are handled.
- Usage events are created if billable.
- Webhook events are emitted if documented.
- Documentation is updated if behavior changed.

## Phase 1 Build Contract

The first implementation phase must produce a complete mock product.

Required user journey:

1. User creates an API key or uses seeded test key.
2. User creates an agent.
3. User provisions a mock phone number.
4. User attaches the number to the agent.
5. User sends a mock outbound SMS.
6. User simulates inbound SMS.
7. User starts a mock outbound call.
8. User views transcript, summary, and outcome.
9. User configures webhook endpoint.
10. User sends test webhook delivery.
11. User simulates webhook failure and retry.
12. User views usage and simulated billing balance.

No real telecom credentials should be required for this journey.

## Avoid These Mistakes

- Do not build a landing page before core product.
- Do not make Twilio the product abstraction.
- Do not store provider IDs as primary IDs.
- Do not skip webhook delivery logs.
- Do not skip usage events.
- Do not hide failed provider states.
- Do not make hosted AI mode required for Phase 1.
- Do not build one-off simulation actions that do not create inspectable records.

## AI Prompt Template For Future Development Tasks

Use this template when asking an AI agent to implement a feature:

```txt
Implement [feature] for Vukho.

Before coding, read:
- docs/README.md
- docs/PRODUCT_SPEC.md
- docs/PROJECT_DOCS.md
- docs/BACKEND_SPEC.md
- docs/FRONTEND_SPEC.md if UI is involved

Follow the documented route shapes, states, domain objects, and acceptance criteria.
Do not invent undocumented product behavior.
If the implementation requires a product decision not covered by docs, update the relevant doc in the same task and explain the decision.
Add tests or repeatable verification steps.
```

## Documentation Update Rule

When code changes behavior:

- Product meaning changes go in `PRODUCT_SPEC.md`.
- Roadmap sequencing changes go in `ROADMAP.md`.
- Architecture/convention changes go in `PROJECT_DOCS.md`.
- Backend/API changes go in `BACKEND_SPEC.md`.
- Dashboard/UI changes go in `FRONTEND_SPEC.md`.
- AI implementation workflow changes go in this file.
