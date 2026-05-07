# AgentLine Next Phase Plan

## Current Focus

**Phase 2B: Twilio Hardening And Live Verification**

Phase 2B has started. Twilio callback signature verification, duplicate callback suppression, and voice usage preauthorization/finalization are implemented. The remaining work is provider resilience, abuse controls, compliance fields, and bounded live verification.

## Goals

- Keep `TELECOM_PROVIDER=mock` as the default for local development.
- Add provider request timeout/retry behavior.
- Add live Twilio sandbox verification guide and checklist.
- Add 10DLC/compliance fields to numbers/projects.
- Add rate limits and abuse guards around outbound SMS.
- Keep provider errors normalized as `provider_error`.

## Build

- provider request timeout wrapper.
- provider retry policy for safe idempotent operations.
- project/number compliance fields.
- outbound SMS rate limiting by workspace/project/agent.
- live sandbox checklist.

## Phase 2B Implementation Order

1. Add provider timeout and normalized retry handling.
2. Add outbound SMS rate-limit guard.
3. Add 10DLC/compliance fields.
4. Run live Twilio sandbox verification.
5. Document production callback URLs and rollback plan.

## Phase 2A Review Findings To Address

- Provider HTTP requests do not yet have explicit timeout/retry policy.
- Outbound SMS has no rate-limit or abuse guard yet.
- Number/project compliance metadata is still missing.

## Alternative Next Track

Production safety prep:

- provider request retry/backoff.
- provider rate-limit normalization.
- abuse controls for outbound SMS.
- 10DLC/compliance fields.

## Current Recommendation

Implement **Twilio hardening and live verification** next, while keeping mock mode as the default.
