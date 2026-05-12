# AgentLine Twilio Testing Strategy

This document defines how AgentLine should use Twilio for local development,
staging, automated tests, and production.

Goal:

> Use actual Twilio-backed flows for local and staging development wherever
> Twilio supports them, and quarantine mock behavior to unit tests, contract
> tests, and deterministic CI tests.

## Official Twilio Testing Capabilities

Twilio provides **test credentials** that can exercise selected REST API
resources without charging the account, updating live account state, or
connecting to real phone numbers.

Official supported resources for test credentials:

- buying phone numbers through `POST /IncomingPhoneNumbers`
- sending SMS messages
- making calls
- Lookup

Important limitation:

- SMS and calls created with Twilio test credentials **do not trigger status
  callbacks**.
- Test credentials do not receive real inbound SMS or real inbound calls.
- Test credentials cannot interact with resources in the live account.
- Available-number search is not a supported test-credential resource; using
  test credentials against `GET /AvailablePhoneNumbers` returns `403`.
- Requests to unsupported resources with test credentials return `403`.

Therefore, AgentLine needs two real-provider development modes:

1. `twilio-test`: Twilio test credentials and magic numbers for REST API success
   and failure cases.
2. `twilio-live-dev`: a real Twilio test/trial/live project with a real public
   webhook URL for inbound SMS, inbound calls, and callbacks.

## Local Development Policy

Local development should no longer default to mock provider behavior.

Default local target:

```env
APP_ENV=local
TELECOM_PROVIDER=twilio
TWILIO_MODE=test
```

Use Twilio test credentials for local REST-provider flows:

- number provisioning success/failure
- outbound SMS success/failure
- outbound call success/failure
- provider error normalization
- billing authorization before provider writes
- local persistence of normalized AgentLine records

Use Twilio live-dev credentials plus a tunnel for local webhook flows:

```env
APP_ENV=local
TELECOM_PROVIDER=twilio
TWILIO_MODE=live-dev
PUBLIC_API_URL=https://your-tunnel-url.ngrok.app
TWILIO_INBOUND_SMS_WEBHOOK_URL=https://your-tunnel-url.ngrok.app/v1/providers/twilio/sms/inbound
TWILIO_MESSAGE_STATUS_CALLBACK_URL=https://your-tunnel-url.ngrok.app/v1/providers/twilio/sms/status
TWILIO_VOICE_WEBHOOK_URL=https://your-tunnel-url.ngrok.app/v1/providers/twilio/voice/inbound
TWILIO_VOICE_GATHER_CALLBACK_URL=https://your-tunnel-url.ngrok.app/v1/providers/twilio/voice/gather
TWILIO_VOICE_STATUS_CALLBACK_URL=https://your-tunnel-url.ngrok.app/v1/providers/twilio/voice/status
```

Twilio webhooks require a publicly accessible URL. Localhost alone is not
enough for inbound webhooks or callbacks.

## Environment Matrix

| Environment | Telecom Provider | Twilio Mode | Purpose |
|---|---|---|---|
| `local` | `twilio` | `test` | Default local REST provider testing without charges. |
| `local-webhook` | `twilio` | `live-dev` | Local inbound/callback testing through ngrok or another tunnel. |
| `test` | `mock` or signed fixtures | n/a | Unit/contract tests only; no network dependency. |
| `staging` | `twilio` | `live-dev` | Safe integration tests and selected real callback tests. |
| `production` | `twilio` | `live` | Real customer traffic. |

Mock provider is not a local product mode anymore. It is a test utility.

## Mock Quarantine Rule

Allowed mock usage:

- unit tests
- contract tests
- deterministic CI tests

Disallowed mock usage:

- default local dashboard flow
- staging user-facing flows
- production user-facing flows
- silent fallback when Twilio config is missing
- product-facing simulation routes

Required guard:

- `APP_ENV=production` must reject `TELECOM_PROVIDER=mock`.
- `APP_ENV=staging` must reject `TELECOM_PROVIDER=mock`.
- `APP_ENV=local` must reject `TELECOM_PROVIDER=mock`.

## Twilio Test Credentials Configuration

Required environment variables for local `twilio-test`:

```env
TELECOM_PROVIDER=twilio
TWILIO_MODE=test
TWILIO_TEST_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_TEST_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+15005550006
```

Implementation rule:

- When `TWILIO_MODE=test`, the Twilio adapter must use
  `TWILIO_TEST_ACCOUNT_SID` and `TWILIO_TEST_AUTH_TOKEN`.
- Magic numbers should be used to create predictable success/failure scenarios.
- Local records should still be real AgentLine database records.

## Twilio Magic Number Coverage

AgentLine should support local test cases using Twilio magic values.

Number provisioning:

- `+15005550006`: valid and available
- `+15005550000`: unavailable
- `+15005550001`: invalid
- area code `500`: at least one number available
- area code `533`: no available numbers

AgentLine local `TWILIO_MODE=test` provisions the configured magic
`TWILIO_FROM_NUMBER` directly with `POST /IncomingPhoneNumbers`. It must not
call `GET /AvailablePhoneNumbers` in test mode.

Outbound SMS:

- `From +15005550006`: valid sender
- `From +15005550007`: not owned or not SMS-capable
- `From +15005550008`: queue full
- `To +15005550001`: invalid recipient
- `To +15005550002`: cannot route
- `To +15005550003`: international permissions missing
- `To +15005550004`: blocked
- `To +15005550009`: cannot receive SMS

Outbound calls:

- `From +15005550006`: valid caller
- `To +15005550001`: invalid recipient
- `To +15005550002`: cannot route
- `To +15005550003`: international permissions missing
- `To +15005550004`: blocked

## Local Webhook Testing

For inbound SMS, inbound calls, and real status callbacks:

1. Run backend locally.
2. Start a public tunnel to the backend.
3. Set `PUBLIC_API_URL` and Twilio callback URLs to the tunnel URL.
4. Configure Twilio number callbacks to the tunnel URL.
5. Use real Twilio live-dev credentials.
6. Send an SMS to the Twilio number or call the number.
7. Verify:
   - Twilio signature validation passes.
   - raw provider event is stored.
   - normalized AgentLine records are created.
   - usage and billing are recorded.
   - webhook delivery is created.

Do not use unsigned hand-posted callback payloads as the main local strategy.
They can remain only as contract tests for the callback parser.

## Implementation Phases

### T0: Config And Mode Guard

Build:

- `TWILIO_MODE`: `test`, `live-dev`, `live`
- strict provider mode validation
- fail closed when required credentials are missing
- block mock provider outside `APP_ENV=test`

Exit criteria:

- Local defaults to `twilio-test`.
- Mock is allowed only in `APP_ENV=test`.

### T1: Twilio Test Credentials Adapter Flow

Build:

- adapter selects test credentials when `TWILIO_MODE=test`
- number provisioning uses magic numbers/area codes
- outbound SMS uses magic numbers
- outbound calls use magic numbers
- provider errors normalize into AgentLine errors
- no status callback expectation in test mode

Exit criteria:

- Local can create real AgentLine records from Twilio test credential responses
  without charges.

### T2: Local Live-Dev Webhook Flow

Build:

- tunnel-based callback URL config
- callback URL readiness checks
- inbound SMS local guide
- inbound call local guide
- Twilio signature verification against exact external URL
- real raw event capture

Exit criteria:

- A local developer can receive a real inbound SMS/call through Twilio into the
  local AgentLine backend.

### T3: Remove Mock From Product Flows

Build:

- remove product-facing mock-only routes
- remove mock defaults from local product docs
- add tests proving local/staging/production reject mock provider

Exit criteria:

- Product flows are Twilio-backed in local/staging/production.
- Mock remains available only for automated tests.

## Documentation Sources

- Twilio Test Credentials:
  <https://www.twilio.com/docs/iam/test-credentials>
- Twilio SMS application testing:
  <https://www.twilio.com/docs/messaging/tutorials/automate-testing>
- Twilio Webhooks Overview:
  <https://www.twilio.com/docs/usage/webhooks/webhooks-overview>
- Twilio Webhooks Security:
  <https://www.twilio.com/docs/usage/webhooks/webhooks-security>
- Twilio Messaging Webhooks:
  <https://www.twilio.com/docs/usage/webhooks/messaging-webhooks>
