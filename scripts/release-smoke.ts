type ApiEnvelope<T> = { data: T };
type ApiListEnvelope<T> = { data: T[]; pagination?: { limit: number; nextCursor: string | null } };
type ApiErrorEnvelope = {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
};

type SmokeResult = {
  name: string;
  status: 'passed' | 'skipped';
  detail?: string;
};

type SmokeAgent = {
  id: string;
  name: string;
};

type SmokeNumber = {
  id: string;
  phoneNumber: string;
  agentId?: string | null;
};

type SmokeMessage = {
  id: string;
  agentId: string;
  status: string;
};

type SmokeCall = {
  id: string;
  agentId: string;
  status: string;
};

type SmokeUsageEvent = {
  id: string;
  resourceId: string;
  totalCost: string;
};

type SmokeWebhookDelivery = {
  id: string;
  eventType: string;
  status: string;
  lastStatusCode?: number | null;
  lastError?: string | null;
};

type ProviderHealth = {
  releaseReady?: boolean;
  releaseBlockers?: string[];
  telecom?: { provider?: string; ready?: boolean };
  stripe?: { configured?: boolean; webhookConfigured?: boolean };
  brevo?: { configured?: boolean };
};

const apiUrl = normalizeApiUrl(process.env.VUKHO_SMOKE_API_URL ?? apiUrlFromPort());
const apiKey = process.env.VUKHO_SMOKE_API_KEY ?? process.env.VUKHO_SEED_API_KEY;
const importNumber = process.env.VUKHO_SMOKE_IMPORT_NUMBER;
const destinationNumber = process.env.VUKHO_SMOKE_TO_NUMBER;
const webhookUrl = process.env.VUKHO_SMOKE_WEBHOOK_URL;
const allowPartial = process.env.VUKHO_SMOKE_ALLOW_PARTIAL === 'true';
const skipCall = process.env.VUKHO_SMOKE_SKIP_CALL === 'true';
const skipSms = process.env.VUKHO_SMOKE_SKIP_SMS === 'true';

const results: SmokeResult[] = [];

async function main() {
  requireValue('VUKHO_SMOKE_API_KEY or VUKHO_SEED_API_KEY', apiKey);

  const health = await get<unknown>('/health');
  pass('Backend health', 'GET /v1/health returned ok.');

  const providerHealth = await get<ProviderHealth>('/health/providers');
  assertReleaseReady(providerHealth);
  pass('Provider readiness', summarizeProviderHealth(providerHealth));

  const agent = await post<SmokeAgent>('/agents', {
    name: `Release Smoke ${new Date().toISOString()}`,
    mode: 'webhook',
    systemPrompt: 'You are a concise Vukho release smoke-test agent.',
    beginMessage:
      'Hello from Vukho. This is a release smoke test. Please say a short confirmation after the tone.',
    webhookUrl: webhookUrl ?? undefined,
    metadata: {
      source: 'release-smoke',
      createdAt: new Date().toISOString(),
    },
  });
  pass('Agent created', `${agent.name} (${agent.id})`);

  let number: SmokeNumber | null = null;
  if (importNumber) {
    number = await post<SmokeNumber>('/numbers/import', {
      agentId: agent.id,
      phoneNumber: importNumber,
      capabilities: ['sms', 'voice'],
    });
    pass('Owned number imported', `${number.phoneNumber} attached to ${agent.id}.`);
  } else {
    skipOrFail(
      'Owned number import',
      'Set VUKHO_SMOKE_IMPORT_NUMBER to an existing provider number before release.',
    );
  }

  if (webhookUrl) {
    const endpoint = await post<{ id: string }>('/webhooks', {
      url: webhookUrl,
      events: [
        'agent.message.sent',
        'agent.message.received',
        'agent.message.delivery_updated',
        'agent.call.started',
        'agent.call.completed',
        'agent.call.failed',
        'agent.usage.recorded',
        'agent.usage.finalized',
        'agent.number.imported',
        'webhook.test',
      ],
    });
    pass('Webhook endpoint created', `Endpoint ${endpoint.id} receives core release events.`);

    const testDelivery = await post<{ delivery: SmokeWebhookDelivery }>(
      `/webhooks/${endpoint.id}/test`,
      {},
    );
    assertSucceededDelivery(testDelivery.delivery, 'Webhook test delivery did not succeed.');
    pass('Webhook endpoint receives signed delivery', formatDelivery(testDelivery.delivery));
  } else {
    skipOrFail(
      'Webhook endpoint created',
      'Set VUKHO_SMOKE_WEBHOOK_URL to verify signed delivery.',
    );
  }

  let message: SmokeMessage | null = null;
  if (!skipSms && destinationNumber) {
    message = await post<SmokeMessage>('/messages', {
      agentId: agent.id,
      to: destinationNumber,
      body: `Vukho release smoke SMS ${new Date().toISOString()}`,
    });
    pass('Outbound SMS created', `${message.id} status=${message.status}.`);
  } else {
    skipOrFail(
      'Outbound SMS created',
      'Set VUKHO_SMOKE_TO_NUMBER to send a real SMS, or VUKHO_SMOKE_SKIP_SMS=true to skip intentionally.',
    );
  }

  let call: SmokeCall | null = null;
  if (!skipCall && destinationNumber) {
    call = await post<SmokeCall>('/calls', {
      agentId: agent.id,
      to: destinationNumber,
    });
    pass('Outbound call created', `${call.id} status=${call.status}.`);
  } else {
    skipOrFail(
      'Outbound call created',
      'Set VUKHO_SMOKE_TO_NUMBER to place a real call, or VUKHO_SMOKE_SKIP_CALL=true to skip intentionally.',
    );
  }

  if (call) {
    const refreshedCall = await pollCall(call.id);
    pass(
      'Call readable after provider callbacks',
      `${refreshedCall.id} status=${refreshedCall.status}.`,
    );
  }

  const agents = await getList<SmokeAgent>('/agents?limit=10');
  assert(
    agents.some((item) => item.id === agent.id),
    'Created agent is not visible in GET /agents.',
  );
  pass('Agent list contains smoke agent');

  const numbers = await getList<SmokeNumber>('/numbers?limit=20');
  if (number) {
    assert(
      numbers.some((item) => item.id === number?.id),
      'Imported number is not visible in GET /numbers.',
    );
    pass('Number list contains imported number');
  }

  const calls = await getList<SmokeCall>('/calls?limit=20');
  if (call) {
    assert(
      calls.some((item) => item.id === call?.id),
      'Outbound call is not visible in GET /calls.',
    );
    pass('Call list contains smoke call');
  }

  const conversations = await getList<{ id: string }>('/conversations?limit=20');
  pass('Conversations readable', `${conversations.length} recent conversations returned.`);

  const usage = await getList<SmokeUsageEvent>('/usage?limit=50');
  const expectedResourceIds = [message?.id, call?.id, number?.id].filter(Boolean);
  if (expectedResourceIds.length > 0) {
    assert(
      usage.some((item) => expectedResourceIds.includes(item.resourceId)),
      'Usage ledger does not include the smoke SMS, call, or number resource yet.',
    );
  }
  pass('Usage evidence readable', `${usage.length} recent usage events returned.`);

  await get<unknown>('/billing/balance');
  pass('Billing balance readable');

  await get<unknown>('/billing/cost-summary');
  pass('Billing cost summary readable');

  const auditEvents = await getList<{ id: string }>('/audit-events?limit=50');
  assert(auditEvents.length > 0, 'Audit log returned no events.');
  pass('Audit log readable', `${auditEvents.length} recent audit events returned.`);

  const deliveries = await getList<SmokeWebhookDelivery>('/webhooks/deliveries?limit=50');
  pass('Webhook deliveries readable', `${deliveries.length} recent delivery rows returned.`);

  await get<unknown>('/provider-events/summary');
  pass('Provider callback summary readable');

  printSummary();
}

function apiUrlFromPort() {
  return `http://localhost:${process.env.PORT ?? '3000'}/v1`;
}

function normalizeApiUrl(value: string) {
  return value.replace(/\/$/, '');
}

function requireValue(name: string, value: string | undefined): asserts value is string {
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text
    ? (JSON.parse(text) as ApiEnvelope<T> & ApiListEnvelope<T> & ApiErrorEnvelope)
    : {};

  if (!response.ok) {
    const code = payload.error?.code ?? response.status;
    const message = payload.error?.message ?? response.statusText;
    throw new Error(`${method} ${path} failed (${code}): ${message}`);
  }

  return payload.data as T;
}

async function get<T>(path: string) {
  return request<T>('GET', path);
}

async function getList<T>(path: string) {
  return request<T[]>('GET', path);
}

async function post<T>(path: string, body: unknown) {
  return request<T>('POST', path, body);
}

async function pollCall(callId: string) {
  let latest = await get<SmokeCall>(`/calls/${callId}`);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (latest.status !== 'queued' && latest.status !== 'ringing') {
      return latest;
    }
    await sleep(5000);
    latest = await get<SmokeCall>(`/calls/${callId}`);
  }
  return latest;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pass(name: string, detail?: string) {
  results.push({ name, status: 'passed', detail });
}

function skipOrFail(name: string, detail: string) {
  if (allowPartial) {
    results.push({ name, status: 'skipped', detail });
    return;
  }
  throw new Error(`${name} skipped: ${detail}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertReleaseReady(health: ProviderHealth) {
  if (health.releaseReady === false && !allowPartial) {
    throw new Error(`Provider readiness failed: ${(health.releaseBlockers ?? []).join('; ')}`);
  }
}

function assertSucceededDelivery(
  delivery: SmokeWebhookDelivery,
  message: string,
): asserts delivery is SmokeWebhookDelivery {
  if (delivery.status !== 'succeeded') {
    throw new Error(`${message} ${formatDelivery(delivery)}`);
  }
}

function formatDelivery(delivery: SmokeWebhookDelivery) {
  const statusCode = delivery.lastStatusCode ? ` statusCode=${delivery.lastStatusCode}` : '';
  const error = delivery.lastError ? ` error=${delivery.lastError}` : '';
  return `${delivery.id} ${delivery.eventType} status=${delivery.status}${statusCode}${error}`;
}

function summarizeProviderHealth(health: ProviderHealth) {
  return [
    `release=${health.releaseReady ? 'ready' : 'not-ready'}`,
    `telecom=${health.telecom?.provider ?? 'unknown'}:${health.telecom?.ready ? 'ready' : 'not-ready'}`,
    `stripe=${health.stripe?.configured ? 'ready' : 'not-ready'}`,
    `stripeWebhook=${health.stripe?.webhookConfigured ? 'ready' : 'not-ready'}`,
    `email=${health.brevo?.configured ? 'ready' : 'not-ready'}`,
  ].join(', ');
}

function printSummary() {
  console.log('\nVukho release smoke summary');
  console.log(`API: ${apiUrl}`);
  for (const result of results) {
    const marker = result.status === 'passed' ? 'PASS' : 'SKIP';
    console.log(`${marker} ${result.name}${result.detail ? ` - ${result.detail}` : ''}`);
  }
}

main().catch((error: unknown) => {
  console.error('\nVukho release smoke failed');
  console.error(error instanceof Error ? error.message : error);
  if (!allowPartial) {
    console.error(
      '\nSet VUKHO_SMOKE_ALLOW_PARTIAL=true only for a readiness run, not for release sign-off.',
    );
  }
  process.exit(1);
});
