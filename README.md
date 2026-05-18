# Vukho Backend

Vukho is AI-agent-native phone infrastructure. It gives AI agents phone numbers, SMS, calls, transcripts, webhooks, usage tracking, and structured outcomes through one developer-first API.

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
npm run db:docker:up
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Phase 1 must run without Twilio, Telnyx, OpenAI, STT, TTS, Stripe, or real phone credentials.

Stripe is optional for local development. To test real checkout, set `STRIPE_MODE=test`,
`STRIPE_SECRET_KEY=sk_test_...` or `rk_test_...`, and `STRIPE_WEBHOOK_SECRET=whsec_...`; then follow
[the Stripe billing plan](docs/STRIPE_BILLING_PLAN.md).

## Backend Bootstrap

Use these commands for a fresh local setup:

```bash
cd /Users/girish/girish-workspace/girish-own/vukho

npm install
cp .env.example .env

npm run db:docker:up
npm run db:generate
npm run db:push
npm run db:seed

npm run dev
```

The API runs at:

```text
http://localhost:3000/v1
```

Seeded local API key:

```text
sk_test_vukho_local
```

Quick health check:

```bash
curl http://localhost:3000/v1/health
```

Quick authenticated check:

```bash
curl http://localhost:3000/v1/workspaces/current \
  -H "Authorization: Bearer sk_test_vukho_local"
```

### Bootstrap Commands

- `npm run db:docker:up`: starts local Postgres on `localhost:5432` and test Postgres on `localhost:5433`.
- `npm run db:generate`: generates the Prisma client.
- `npm run db:push`: creates or syncs database tables from `prisma/schema.prisma`.
- `npm run db:seed`: creates the local workspace, project, API key, billing balance, seed agents, and seed webhook.
- `npm run db:topup`: adds local development credits to `ws_local` when mock calls/SMS/numbers exhaust the balance.
- `npm run dev`: starts the NestJS backend in watch mode.

If local testing returns `insufficient_balance`, run:

```bash
npm run db:topup
```

You can change the top-up amount in cents:

```bash
VUKHO_LOCAL_TOPUP_CENTS=10000 npm run db:topup
```

### Frontend Connection

For the separate dashboard repository, create:

```text
/Users/girish/girish-workspace/girish-own/vukho-dashboard/.env
```

with:

```bash
VITE_VUKHO_API_URL=http://localhost:3000/v1
```

Then sign in to the dashboard with:

```text
sk_test_vukho_local
```
