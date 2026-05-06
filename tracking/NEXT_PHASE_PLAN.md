# AgentLine Next Phase Plan

## Current Focus

**Phase 2B: Twilio Hardening And Live Verification**

Phase 2A added provider-safe billing flow, Twilio SMS callback URLs, inbound/status callback ingestion, raw provider event persistence, and callback simulation in DB-backed e2e. The next phase is to harden public Twilio ingress and prepare bounded live verification.

## Goals

- Keep `TELECOM_PROVIDER=mock` as the default for local development.
- Verify Twilio request signatures on public callback routes.
- Add provider request timeout/retry behavior.
- Add live Twilio sandbox verification guide and checklist.
- Add 10DLC/compliance fields to numbers/projects.
- Add rate limits and abuse guards around outbound SMS.
- Keep provider errors normalized as `provider_error`.

## Build

- Twilio HMAC signature verifier for callbacks.
- callback timestamp/replay tolerance where applicable.
- provider request timeout wrapper.
- provider retry policy for safe idempotent operations.
- project/number compliance fields.
- outbound SMS rate limiting by workspace/project/agent.
- live sandbox checklist.

## Phase 2A Implementation Order

1. Add Twilio callback signature verification.
2. Add provider timeout and normalized retry handling.
3. Add outbound SMS rate-limit guard.
4. Add 10DLC/compliance fields.
5. Run live Twilio sandbox verification.
6. Document production callback URLs and rollback plan.

## Alternative Next Track

Production safety prep:

- provider request retry/backoff.
- provider rate-limit normalization.
- abuse controls for outbound SMS.
- 10DLC/compliance fields.

## Current Recommendation

Implement **Twilio hardening and live verification** next, while keeping mock mode as the default.
