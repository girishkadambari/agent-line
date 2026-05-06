# AgentLine Phase 1 Smoke Flow

This smoke flow proves the mock backend loop works end to end without Twilio, Telnyx, OpenAI, Stripe, STT, TTS, or real phone credentials.

## Prerequisites

```bash
npm install
npm run db:docker:up
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Default local values:

- API URL: `http://localhost:3000/v1`
- API key: `sk_test_agentline_local`
- Workspace: `ws_local`
- Project: `proj_local`
- Seed agent: `agt_support`
- Seed webhook: `wh_local`

```bash
export AGENTLINE_API_URL="http://localhost:3000/v1"
export AGENTLINE_API_KEY="sk_test_agentline_local"
```

## Golden Path

### 1. Check Health

```bash
curl "$AGENTLINE_API_URL/health"
```

Expected: `status` is `ok`.

### 2. Confirm Workspace Scope

```bash
curl "$AGENTLINE_API_URL/workspaces/current" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

Expected: workspace is `ws_local`.

### 3. Create Or Use Agent

Seed data includes `agt_support`. To create another agent:

```bash
curl -X POST "$AGENTLINE_API_URL/agents" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Agent","mode":"webhook","voice":"alloy","systemPrompt":"You are a helpful phone agent."}'
```

Expected: returned object has an `id` beginning with `agt_`.

### 4. Provision A Mock Number

```bash
curl -X POST "$AGENTLINE_API_URL/numbers" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","country":"US","areaCode":"415","capabilities":["sms","voice"]}'
```

Expected:

- number status is `active`.
- capabilities include `sms` and `voice`.
- billing balance decreases by mock number cost.
- a usage event is created.

### 5. Send Outbound SMS

```bash
curl -X POST "$AGENTLINE_API_URL/messages" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","to":"+14155550123","body":"Hello from AgentLine smoke test."}'
```

Expected:

- message direction is `outbound`.
- status is `delivered` in mock mode.
- conversation/contact are created or reused.
- usage event is created.
- matching webhook deliveries are created if subscribed.

### 6. Simulate Inbound SMS

```bash
curl -X POST "$AGENTLINE_API_URL/simulations/inbound-sms" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","from":"+14155550123","body":"Reply from customer."}'
```

Expected:

- message direction is `inbound`.
- status is `received`.
- usage event is created.
- `agent.message.received` internal event is created.

### 7. Inspect Conversations

```bash
curl "$AGENTLINE_API_URL/conversations" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

Use the returned conversation id:

```bash
curl "$AGENTLINE_API_URL/conversations/CONVERSATION_ID/messages" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

Expected: outbound and inbound SMS messages are visible.

### 8. Create Mock Call

```bash
curl -X POST "$AGENTLINE_API_URL/calls" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","to":"+14155550123"}'
```

Expected:

- call status is `completed`.
- summary and outcome are present.
- transcript turns are created.
- call usage event is created by billable minutes.
- matching webhook deliveries are created if subscribed.

### 9. Inspect Transcript

```bash
curl "$AGENTLINE_API_URL/calls/CALL_ID/transcript" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

Expected: transcript turns are ordered by `startedAtMs`.

### 10. Create And Test Webhook

```bash
curl -X POST "$AGENTLINE_API_URL/webhooks" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/webhooks/agentline","events":["webhook.test","agent.message.sent","agent.call.completed"]}'
```

Then test it:

```bash
curl -X POST "$AGENTLINE_API_URL/webhooks/WEBHOOK_ID/test" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected:

- response includes delivery record.
- response includes `agentline-signature` and `agentline-timestamp` headers in the returned JSON.
- no real HTTP request is sent in Phase 1.

### 11. Inspect Usage

```bash
curl "$AGENTLINE_API_URL/usage" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl "$AGENTLINE_API_URL/usage/daily" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

Expected: usage events exist for number, SMS, and voice.

### 12. Inspect Billing Balance

```bash
curl "$AGENTLINE_API_URL/billing/balance" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

Expected: balance reflects mock usage debits.

## Frontend Integration Notes

Dashboard screens can be connected in this order:

1. Overview: health, usage summary, billing balance.
2. Agents: list/create/update agents.
3. Numbers: provision/list/release numbers.
4. Inbox: conversations and messages.
5. Calls: list calls and transcript.
6. Webhooks: endpoint CRUD and delivery logs.
7. Usage/Billing: usage table, rollups, balance.
8. Settings: workspace/team/invites/audit/API keys when API-key management routes are added.

Expected UI states:

- Loading: show stable skeleton rows for lists.
- Empty: explain the next action without marketing copy.
- Error: show API `error.message` and keep `error.code` available for debugging.
- Insufficient balance: link to future billing add-credit flow.
- Webhook failed/retrying/exhausted: expose retry action in Phase 1.

## Known Phase 1 Limitations

- Mock mode is the default. Twilio adapter support exists behind `TELECOM_PROVIDER=twilio`, but live Twilio behavior still needs real credentials and sandbox verification.
- No real outbound webhook HTTP dispatch.
- No hosted AI execution yet.
- DB-backed e2e tests require Docker Postgres:

```bash
npm run db:docker:up
npm run db:test:push
npm run test:e2e:db
```
