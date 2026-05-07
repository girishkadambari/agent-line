# AgentLine Phase 1 API Examples

These examples assume the local API is running at `http://localhost:3000/v1` and the seed API key is `sk_test_agentline_local`.

```bash
export AGENTLINE_API_URL="http://localhost:3000/v1"
export AGENTLINE_API_KEY="sk_test_agentline_local"
```

All protected routes use:

```bash
-H "Authorization: Bearer $AGENTLINE_API_KEY"
```

## Health

```bash
curl "$AGENTLINE_API_URL/health"
```

## Workspace

```bash
curl "$AGENTLINE_API_URL/workspaces/current" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl -X PATCH "$AGENTLINE_API_URL/workspaces/current" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"AgentLine Local"}'
```

## Team And Invites

```bash
curl "$AGENTLINE_API_URL/workspaces/current/members" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl -X POST "$AGENTLINE_API_URL/workspaces/current/invites" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"developer@example.com","role":"developer"}'
```

```bash
curl "$AGENTLINE_API_URL/workspaces/current/invites" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

## Audit

```bash
curl "$AGENTLINE_API_URL/audit-events?limit=20" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

## API Keys

```bash
curl "$AGENTLINE_API_URL/api-keys" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl -X POST "$AGENTLINE_API_URL/api-keys" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"Local frontend key"}'
```

The raw `key` is returned only once on creation. Store it immediately in the client environment or secrets manager.

```bash
curl -X PATCH "$AGENTLINE_API_URL/api-keys/key_123" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"Renamed key"}'
```

```bash
curl -X DELETE "$AGENTLINE_API_URL/api-keys/key_123" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

Delete revokes the key; it does not remove historical records.

## Agents

```bash
curl "$AGENTLINE_API_URL/agents" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl -X POST "$AGENTLINE_API_URL/agents" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Reservation Agent",
    "description": "Handles booking calls and SMS.",
    "mode": "webhook",
    "systemPrompt": "You help customers book reservations.",
    "voice": "alloy",
    "beginMessage": "Hi, I am calling about your reservation."
  }'
```

```bash
curl "$AGENTLINE_API_URL/agents/voices" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

## Numbers

```bash
curl -X POST "$AGENTLINE_API_URL/numbers" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","country":"US","areaCode":"415","capabilities":["sms","voice"]}'
```

```bash
curl "$AGENTLINE_API_URL/numbers" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl -X POST "$AGENTLINE_API_URL/agents/agt_support/numbers" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"country":"US","areaCode":"650","capabilities":["sms","voice"]}'
```

## Messages And Conversations

```bash
curl -X POST "$AGENTLINE_API_URL/messages" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","to":"+14155550123","body":"Hello from AgentLine."}'
```

```bash
curl -X POST "$AGENTLINE_API_URL/simulations/inbound-sms" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","from":"+14155550123","body":"I need help with my booking."}'
```

```bash
curl "$AGENTLINE_API_URL/conversations" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl "$AGENTLINE_API_URL/conversations/conv_123/messages" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

Replace `conv_123` with an id returned from the conversations list.

## Calls And Transcripts

```bash
curl -X POST "$AGENTLINE_API_URL/calls" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","to":"+14155550123"}'
```

```bash
curl "$AGENTLINE_API_URL/calls" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl "$AGENTLINE_API_URL/calls/call_123/transcript" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl -N "$AGENTLINE_API_URL/calls/call_123/transcript/stream" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

Replace `call_123` with an id returned from call creation or call list.

## Webhooks

```bash
curl -X POST "$AGENTLINE_API_URL/webhooks" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/agentline","events":["agent.message.sent","agent.message.received","agent.call.completed","webhook.test"]}'
```

```bash
curl -X POST "$AGENTLINE_API_URL/webhooks/wh_local/test" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```bash
curl "$AGENTLINE_API_URL/webhooks/deliveries?status=pending" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl -X POST "$AGENTLINE_API_URL/webhooks/deliveries/whdel_123/retry" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"outcome":"succeeded"}'
```

## Usage And Billing

```bash
curl "$AGENTLINE_API_URL/usage?limit=50" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl "$AGENTLINE_API_URL/usage/daily" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl "$AGENTLINE_API_URL/usage/monthly" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl "$AGENTLINE_API_URL/billing/balance" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl "$AGENTLINE_API_URL/billing/stripe/status" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

```bash
curl -X POST "$AGENTLINE_API_URL/billing/checkout-sessions" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amountCents": 2000,
    "successUrl": "https://app.agentline.dev/billing/success",
    "cancelUrl": "https://app.agentline.dev/billing/cancel"
  }'
```

```bash
curl -X POST "$AGENTLINE_API_URL/billing/portal-sessions" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"returnUrl":"https://app.agentline.dev/settings/billing"}'
```

```bash
curl "$AGENTLINE_API_URL/billing/transactions" \
  -H "Authorization: Bearer $AGENTLINE_API_KEY"
```

Stripe webhooks are public and verified with `Stripe-Signature`:

For local testing, use Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/v1/billing/stripe/webhook
```

Then set the printed `whsec_...` value as `STRIPE_WEBHOOK_SECRET` and restart the backend.

```bash
curl -X POST "$AGENTLINE_API_URL/billing/stripe/webhook" \
  -H "Stripe-Signature: t=timestamp,v1=signature" \
  -H "Content-Type: application/json" \
  -d '{"id":"evt_123","type":"checkout.session.completed","livemode":false,"data":{"object":{}}}'
```

## Error Shape

Validation, not-found, conflict, and billing errors use:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Human-readable message.",
    "details": {}
  }
}
```
