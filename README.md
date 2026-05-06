# AgentLine Backend

AgentLine is AI-agent-native phone infrastructure. It gives AI agents phone numbers, SMS, calls, transcripts, webhooks, usage tracking, and structured outcomes through one developer-first API.

This repository is backend-first and uses **NestJS + TypeScript**. The React frontend will be built separately and integrated through the documented REST API.

## Documentation

Start with [docs/README.md](docs/README.md).

Implementation tracking lives in [tracking/README.md](tracking/README.md).

Useful Phase 1 integration docs:

- [API examples](docs/API_EXAMPLES.md)
- [Smoke flow](docs/SMOKE_FLOW.md)
- [Project completeness check](docs/PROJECT_COMPLETENESS_CHECK.md)
- [Stripe billing plan](docs/STRIPE_BILLING_PLAN.md)

## Phase

Current work is **Phase 1: Mock Core Product**.

Track implementation in [docs/PHASE_1_STATUS.md](docs/PHASE_1_STATUS.md).

## Local Development

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Phase 1 must run without Twilio, Telnyx, OpenAI, STT, TTS, Stripe, or real phone credentials.
