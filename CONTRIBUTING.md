# Contributing To AgentLine

AgentLine is docs-first. Before changing behavior, read the relevant document in `docs/`.

## Development Rules

- Keep backend behavior aligned with `docs/BACKEND_SPEC.md`.
- Keep Phase 1 progress aligned with `docs/PHASE_1_STATUS.md`.
- Do not add real Twilio, Telnyx, OpenAI, Stripe, STT, or TTS dependencies to Phase 1.
- Keep provider-specific logic behind provider adapters.
- Add tests for new services/controllers.
- Update docs when implementation behavior changes.

## Local Setup

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```
