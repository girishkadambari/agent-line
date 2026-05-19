# Vukho Backend

Vukho is AI-agent-native phone infrastructure. It gives AI agents phone numbers, SMS, calls, transcripts, webhooks, usage tracking, and structured outcomes through one developer-first API.

This repository is backend-first and uses **NestJS + TypeScript**. The React frontend is maintained separately and integrates through the documented REST API.

## Documentation

Start with [docs/README.md](docs/README.md).

Implementation tracking lives in [tracking/README.md](tracking/README.md).

Useful Phase 1 integration docs:

- [API examples](docs/API_EXAMPLES.md)
- [Smoke flow](docs/SMOKE_FLOW.md)
- [Project completeness check](docs/PROJECT_COMPLETENESS_CHECK.md)
- [Stripe billing plan](docs/STRIPE_BILLING_PLAN.md)

## Local Development

```bash
npm install
npm run db:docker:up
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Local development uses the same real provider path as production. Mock providers are reserved for automated tests and explicit contract coverage.

## Backend Bootstrap

Use these commands for a fresh local setup:

```bash
cd /Users/girish/girish-workspace/girish-own/agent-line

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
- `npm run smoke:release`: runs the release smoke check against a live backend.

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
/Users/girish/girish-workspace/girish-own/agentline-dashboard/.env
```

with:

```bash
VITE_VUKHO_API_URL=http://localhost:3000/v1
```

Then sign in to the dashboard with:

```text
sk_test_vukho_local
```

## Release Smoke

The release smoke command proves the customer promise against a running backend:
agent creation, owned-number import, SMS/call actions, usage evidence, billing,
audit, and webhook visibility.

```bash
VUKHO_SMOKE_API_URL=http://localhost:3000/v1 \
VUKHO_SMOKE_API_KEY=sk_test_vukho_local \
VUKHO_SMOKE_IMPORT_NUMBER=+19012316325 \
VUKHO_SMOKE_TO_NUMBER=+917799027234 \
VUKHO_SMOKE_WEBHOOK_URL=https://example.com/vukho/webhook \
npm run smoke:release
```

Use an owned Twilio number for `VUKHO_SMOKE_IMPORT_NUMBER`; this command imports
an existing number and does not buy a new one. Set
`VUKHO_SMOKE_ALLOW_PARTIAL=true` only for readiness checks, not release sign-off.

Callback evidence for inbound SMS/call smoke is available at:

```bash
curl http://localhost:3000/v1/provider-events/summary \
  -H "Authorization: Bearer sk_test_vukho_local"

curl "http://localhost:3000/v1/provider-events?limit=20" \
  -H "Authorization: Bearer sk_test_vukho_local"
```
