# Vukho Phase 1 API Examples

These examples assume the local API is running at `http://localhost:3000/v1` and the seed API key is `sk_test_vukho_local`.

```bash
export VUKHO_API_URL="http://localhost:3000/v1"
export VUKHO_API_KEY="sk_test_vukho_local"
```

Developer API calls use:

```bash
-H "Authorization: Bearer $VUKHO_API_KEY"
```

Dashboard session routes use the HTTP-only `vukho_session` cookie created
by Google OAuth. Google login also sets a readable `vukho_csrf` cookie.
For session-authenticated `POST`, `PATCH`, and `DELETE` requests, send that
value in `X-CSRF-Token`. API-key auth remains available for developer API calls
and does not require CSRF.

Dashboard-facing product routes support both authentication forms. Use API keys
for scripts and SDKs. Use session cookies plus CSRF from the dashboard.

## Auth And Session

Start Google login in a browser:

```bash
open "$VUKHO_API_URL/auth/google/start"
```

After Google redirects back, the backend sets `vukho_session` and redirects
to `DASHBOARD_URL`.

```bash
curl "$VUKHO_API_URL/users/me" \
  -b "vukho_session=$VUKHO_SESSION"
```

```bash
curl -X POST "$VUKHO_API_URL/auth/logout" \
  -b "vukho_session=$VUKHO_SESSION; vukho_csrf=$VUKHO_CSRF" \
  -H "X-CSRF-Token: $VUKHO_CSRF"
```

## Session Workspaces

```bash
curl "$VUKHO_API_URL/workspaces" \
  -b "vukho_session=$VUKHO_SESSION"
```

```bash
curl -X POST "$VUKHO_API_URL/workspaces" \
  -b "vukho_session=$VUKHO_SESSION; vukho_csrf=$VUKHO_CSRF" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $VUKHO_CSRF" \
  -d '{"name":"New workspace"}'
```

```bash
curl -X POST "$VUKHO_API_URL/workspaces/ws_123/switch" \
  -b "vukho_session=$VUKHO_SESSION; vukho_csrf=$VUKHO_CSRF" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $VUKHO_CSRF" \
  -d '{"projectId":"proj_123"}'
```

```bash
curl -X POST "$VUKHO_API_URL/workspaces/invites/accept" \
  -b "vukho_session=$VUKHO_SESSION; vukho_csrf=$VUKHO_CSRF" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $VUKHO_CSRF" \
  -d '{"token":"inv_raw_token"}'
```

## Health

```bash
curl "$VUKHO_API_URL/health"
```

## Workspace

```bash
curl "$VUKHO_API_URL/workspaces/current" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl -X PATCH "$VUKHO_API_URL/workspaces/current" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Vukho Local"}'
```

## Team And Invites

```bash
curl "$VUKHO_API_URL/workspaces/current/members" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl -X POST "$VUKHO_API_URL/workspaces/current/invites" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"developer@example.com","role":"developer"}'
```

```bash
curl "$VUKHO_API_URL/workspaces/current/invites" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

## Audit

```bash
curl "$VUKHO_API_URL/audit-events?limit=20" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

## API Keys

```bash
curl "$VUKHO_API_URL/api-keys" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl -X POST "$VUKHO_API_URL/api-keys" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"Local frontend key"}'
```

The raw `key` is returned only once on creation. Store it immediately in the client environment or secrets manager.

```bash
curl -X PATCH "$VUKHO_API_URL/api-keys/key_123" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"Renamed key"}'
```

```bash
curl -X DELETE "$VUKHO_API_URL/api-keys/key_123" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

Delete revokes the key; it does not remove historical records.

## Agents

```bash
curl "$VUKHO_API_URL/agents" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl -X POST "$VUKHO_API_URL/agents" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
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
curl "$VUKHO_API_URL/agents/voices" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

## Numbers

```bash
curl -X POST "$VUKHO_API_URL/numbers" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","country":"US","areaCode":"415","capabilities":["sms","voice"]}'
```

```bash
curl "$VUKHO_API_URL/numbers" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl -X POST "$VUKHO_API_URL/agents/agt_support/numbers" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"country":"US","areaCode":"650","capabilities":["sms","voice"]}'
```

## Messages And Conversations

```bash
curl -X POST "$VUKHO_API_URL/messages" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","to":"+14155550123","body":"Hello from Vukho."}'
```

Inbound SMS is created by Twilio callbacks, not by product-facing simulation
routes:

```http
POST /v1/providers/twilio/sms/inbound
```

Use `TWILIO_MODE=live-dev` with ngrok for local inbound SMS testing. Twilio test
credentials do not receive inbound SMS or trigger callbacks.

```bash
curl "$VUKHO_API_URL/conversations" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl "$VUKHO_API_URL/conversations/conv_123/messages" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

Replace `conv_123` with an id returned from the conversations list.

## Calls And Transcripts

```bash
curl -X POST "$VUKHO_API_URL/calls" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_support","to":"+14155550123"}'
```

```bash
curl "$VUKHO_API_URL/calls" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl "$VUKHO_API_URL/calls/call_123/transcript" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl -N "$VUKHO_API_URL/calls/call_123/transcript/stream" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

Replace `call_123` with an id returned from call creation or call list.

## Webhooks

```bash
curl -X POST "$VUKHO_API_URL/webhooks" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/vukho","events":["agent.message.sent","agent.message.received","agent.call.completed","webhook.test"]}'
```

```bash
curl -X POST "$VUKHO_API_URL/webhooks/wh_local/test" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```bash
curl "$VUKHO_API_URL/webhooks/deliveries?status=pending" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl -X POST "$VUKHO_API_URL/webhooks/deliveries/whdel_123/retry" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"outcome":"succeeded"}'
```

## Usage And Billing

```bash
curl "$VUKHO_API_URL/usage?limit=50" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl "$VUKHO_API_URL/usage/daily" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl "$VUKHO_API_URL/usage/monthly" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl "$VUKHO_API_URL/billing/balance" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl "$VUKHO_API_URL/billing/stripe/status" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

```bash
curl -X POST "$VUKHO_API_URL/billing/checkout-sessions" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amountCents": 2000,
    "successUrl": "https://app.vukho.dev/billing/success",
    "cancelUrl": "https://app.vukho.dev/billing/cancel"
  }'
```

```bash
curl -X POST "$VUKHO_API_URL/billing/portal-sessions" \
  -H "Authorization: Bearer $VUKHO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"returnUrl":"https://app.vukho.dev/settings/billing"}'
```

```bash
curl "$VUKHO_API_URL/billing/transactions" \
  -H "Authorization: Bearer $VUKHO_API_KEY"
```

Stripe webhooks are public and verified with `Stripe-Signature`:

For local testing, use Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/v1/billing/stripe/webhook
```

Then set the printed `whsec_...` value as `STRIPE_WEBHOOK_SECRET` and restart the backend.

```bash
curl -X POST "$VUKHO_API_URL/billing/stripe/webhook" \
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
