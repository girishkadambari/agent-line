type ApiEnvelope<T> = { data: T };
type ApiListEnvelope<T> = { data: T[]; pagination?: { limit: number; nextCursor: string | null } };
type ApiErrorEnvelope = {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
};

type ProviderEvent = {
  id: string;
  eventType: string;
  providerEventId: string;
  resource: { type: 'message' | 'call'; id: string; status: string; agentId: string | null } | null;
  payload: Record<string, unknown>;
  receivedAt: string;
};

type UsageEvent = {
  id: string;
  resourceId: string;
  totalCost: string;
  occurredAt?: string;
  createdAt?: string;
};

type WebhookDelivery = {
  id: string;
  endpointId: string;
  eventId: string;
  eventType?: string;
  status: string;
  attemptCount?: number;
  lastStatusCode?: number | null;
  lastError?: string | null;
  createdAt?: string;
  payload: {
    resource?: {
      type?: string | null;
      id?: string | null;
    };
  };
};

type TranscriptTurn = {
  id: string;
  speaker: string;
  text: string;
};

type EvidenceState = {
  inboundSms?: ProviderEvent;
  inboundVoice?: ProviderEvent;
  voiceGather?: ProviderEvent;
  smsUsage?: UsageEvent;
  voiceUsage?: UsageEvent;
  messageWebhookDelivery?: WebhookDelivery;
  callWebhookDelivery?: WebhookDelivery;
  transcriptWebhookDelivery?: WebhookDelivery;
  transcriptTurn?: TranscriptTurn;
};

const apiUrl = normalizeApiUrl(process.env.VUKHO_SMOKE_API_URL ?? apiUrlFromPort());
const apiKey = process.env.VUKHO_SMOKE_API_KEY ?? process.env.VUKHO_SEED_API_KEY;
const ownedNumber = normalizePhone(
  process.env.VUKHO_SMOKE_IMPORT_NUMBER ?? process.env.VUKHO_SMOKE_NUMBER,
);
const expectedFrom = normalizePhone(process.env.VUKHO_SMOKE_EXPECT_FROM);
const webhookUrl = process.env.VUKHO_SMOKE_WEBHOOK_URL;
const timeoutSeconds = readPositiveInteger(process.env.VUKHO_SMOKE_TIMEOUT_SECONDS, 180);
const pollMs = readPositiveInteger(process.env.VUKHO_SMOKE_POLL_MS, 5000);

async function main() {
  requireValue('VUKHO_SMOKE_API_KEY or VUKHO_SEED_API_KEY', apiKey);

  console.log('\nVukho inbound smoke watcher');
  console.log(`API: ${apiUrl}`);
  console.log(`Timeout: ${timeoutSeconds}s`);
  const startedAt = new Date();
  console.log(`Started after: ${startedAt.toISOString()}`);
  if (ownedNumber) {
    console.log(`Vukho number: ${ownedNumber}`);
  }
  if (expectedFrom) {
    console.log(`Expected sender/caller: ${expectedFrom}`);
  }
  if (webhookUrl) {
    const endpoint = await post<{ id: string }>('/webhooks', {
      url: webhookUrl,
      events: [
        'agent.message.received',
        'agent.call.started',
        'agent.call.transcript_updated',
        'agent.usage.recorded',
      ],
    });
    console.log(`Webhook endpoint: ${endpoint.id} -> ${webhookUrl}`);
  } else {
    console.log(
      'Webhook endpoint: using existing endpoints. Set VUKHO_SMOKE_WEBHOOK_URL to create one.',
    );
  }
  console.log('\nManual actions:');
  console.log('1. Send an SMS from your test phone to the Vukho number.');
  console.log('2. Call the Vukho number and speak after the prompt.');
  console.log('3. Keep this watcher running until it reports PASS.\n');

  const deadline = Date.now() + timeoutSeconds * 1000;
  let state: EvidenceState = {};
  let lastProgress = '';

  while (Date.now() < deadline) {
    state = await readEvidence(startedAt);
    const progress = formatProgress(state);
    if (progress !== lastProgress) {
      console.log(progress);
      lastProgress = progress;
    }

    if (isComplete(state)) {
      printSummary(state);
      return;
    }

    await sleep(pollMs);
  }

  printSummary(state);
  printMissingEvidence(state);
  throw new Error('Inbound smoke evidence was incomplete before timeout.');
}

async function readEvidence(startedAt: Date): Promise<EvidenceState> {
  const [providerEvents, usage, webhookDeliveries] = await Promise.all([
    getList<ProviderEvent>('/provider-events?limit=100'),
    getList<UsageEvent>('/usage?limit=100'),
    getList<WebhookDelivery>('/webhooks/deliveries?limit=100'),
  ]);

  const currentProviderEvents = providerEvents.filter((event) =>
    isAfterOrEqual(event.receivedAt, startedAt),
  );
  const currentUsage = usage.filter((event) =>
    isAfterOrEqual(event.occurredAt ?? event.createdAt, startedAt),
  );
  const currentDeliveries = webhookDeliveries.filter((delivery) =>
    isAfterOrEqual(delivery.createdAt, startedAt),
  );

  const inboundSms = currentProviderEvents.find(
    (event) =>
      event.eventType === 'twilio.sms.inbound' &&
      matchesNumber(event.payload.From, expectedFrom) &&
      matchesNumber(event.payload.To, ownedNumber),
  );
  const inboundVoice = currentProviderEvents.find(
    (event) =>
      event.eventType === 'twilio.voice.inbound' &&
      matchesNumber(event.payload.From, expectedFrom) &&
      matchesNumber(event.payload.To, ownedNumber),
  );
  const voiceGather = currentProviderEvents.find(
    (event) =>
      event.eventType === 'twilio.voice.gather' &&
      (!inboundVoice?.resource?.id || event.resource?.id === inboundVoice.resource.id),
  );

  const smsUsage = inboundSms?.resource
    ? currentUsage.find((event) => event.resourceId === inboundSms.resource?.id)
    : undefined;
  const voiceUsage = inboundVoice?.resource
    ? currentUsage.find((event) => event.resourceId === inboundVoice.resource?.id)
    : undefined;
  const transcriptTurn = voiceGather?.resource?.id
    ? await findUserTranscriptTurn(voiceGather.resource.id)
    : undefined;
  const messageWebhookDelivery = findResourceDelivery(currentDeliveries, {
    eventType: 'agent.message.received',
    resourceType: 'message',
    resourceId: inboundSms?.resource?.id,
  });
  const callWebhookDelivery = findResourceDelivery(currentDeliveries, {
    eventType: 'agent.call.started',
    resourceType: 'call',
    resourceId: inboundVoice?.resource?.id,
  });
  const transcriptWebhookDelivery = findResourceDelivery(currentDeliveries, {
    eventType: 'agent.call.transcript_updated',
    resourceType: 'call',
    resourceId: voiceGather?.resource?.id,
  });

  return {
    inboundSms,
    inboundVoice,
    voiceGather,
    smsUsage,
    voiceUsage,
    messageWebhookDelivery,
    callWebhookDelivery,
    transcriptWebhookDelivery,
    transcriptTurn,
  };
}

async function findUserTranscriptTurn(callId: string) {
  const turns = await getList<TranscriptTurn>(`/calls/${callId}/transcript`);
  return turns.find((turn) => turn.speaker === 'user' && turn.text.trim().length > 0);
}

function isComplete(state: EvidenceState) {
  return Boolean(
    state.inboundSms?.resource?.type === 'message' &&
    state.inboundVoice?.resource?.type === 'call' &&
    state.voiceGather?.resource?.type === 'call' &&
    state.transcriptTurn &&
    state.smsUsage &&
    state.voiceUsage &&
    isSucceededDelivery(state.messageWebhookDelivery) &&
    isSucceededDelivery(state.callWebhookDelivery) &&
    isSucceededDelivery(state.transcriptWebhookDelivery),
  );
}

function formatProgress(state: EvidenceState) {
  const flags = [
    ['sms-callback', state.inboundSms],
    ['sms-usage', state.smsUsage],
    ['voice-callback', state.inboundVoice],
    ['voice-gather', state.voiceGather],
    ['transcript', state.transcriptTurn],
    ['voice-usage', state.voiceUsage],
    ['message-webhook', isSucceededDelivery(state.messageWebhookDelivery)],
    ['call-webhook', isSucceededDelivery(state.callWebhookDelivery)],
    ['transcript-webhook', isSucceededDelivery(state.transcriptWebhookDelivery)],
  ] as const;

  return flags.map(([name, value]) => `${value ? 'PASS' : 'WAIT'} ${name}`).join(' | ');
}

function printSummary(state: EvidenceState) {
  console.log('\nInbound smoke evidence summary');
  console.log(
    `SMS callback: ${state.inboundSms ? `${state.inboundSms.id} -> ${state.inboundSms.resource?.id}` : 'missing'}`,
  );
  console.log(
    `SMS usage: ${state.smsUsage ? `${state.smsUsage.id} ${state.smsUsage.totalCost}` : 'missing'}`,
  );
  console.log(
    `Voice callback: ${state.inboundVoice ? `${state.inboundVoice.id} -> ${state.inboundVoice.resource?.id}` : 'missing'}`,
  );
  console.log(
    `Voice gather: ${state.voiceGather ? `${state.voiceGather.id} -> ${state.voiceGather.resource?.id}` : 'missing'}`,
  );
  console.log(`Transcript: ${state.transcriptTurn ? state.transcriptTurn.text : 'missing'}`);
  console.log(
    `Voice usage: ${state.voiceUsage ? `${state.voiceUsage.id} ${state.voiceUsage.totalCost}` : 'missing'}`,
  );
  console.log(`Message webhook: ${formatDelivery(state.messageWebhookDelivery)}`);
  console.log(`Call webhook: ${formatDelivery(state.callWebhookDelivery)}`);
  console.log(`Transcript webhook: ${formatDelivery(state.transcriptWebhookDelivery)}`);
}

function printMissingEvidence(state: EvidenceState) {
  const missing = [
    ['SMS inbound callback', !state.inboundSms],
    ['SMS usage event', !state.smsUsage],
    ['Voice inbound callback', !state.inboundVoice],
    ['Voice gather callback', !state.voiceGather],
    ['User transcript turn', !state.transcriptTurn],
    ['Voice usage event', !state.voiceUsage],
    ['Succeeded message webhook delivery', !isSucceededDelivery(state.messageWebhookDelivery)],
    ['Succeeded call webhook delivery', !isSucceededDelivery(state.callWebhookDelivery)],
    [
      'Succeeded transcript webhook delivery',
      !isSucceededDelivery(state.transcriptWebhookDelivery),
    ],
  ]
    .filter(([, isMissing]) => isMissing)
    .map(([label]) => label);

  console.log('\nMissing release evidence:');
  for (const label of missing) {
    console.log(`- ${label}`);
  }

  const failedDeliveries = [
    state.messageWebhookDelivery,
    state.callWebhookDelivery,
    state.transcriptWebhookDelivery,
  ].filter((delivery): delivery is WebhookDelivery =>
    Boolean(delivery && !isSucceededDelivery(delivery)),
  );

  if (failedDeliveries.length > 0) {
    console.log('\nWebhook delivery failures seen:');
    for (const delivery of failedDeliveries) {
      console.log(`- ${formatDelivery(delivery)}`);
    }
  }
}

function apiUrlFromPort() {
  return `http://localhost:${process.env.PORT ?? '3000'}/v1`;
}

function normalizeApiUrl(value: string) {
  return value.replace(/\/$/, '');
}

function normalizePhone(value: string | undefined) {
  return value?.replace(/[^\d+]/g, '') || undefined;
}

function matchesNumber(actual: unknown, expected: string | undefined) {
  if (!expected) {
    return true;
  }
  return normalizePhone(typeof actual === 'string' ? actual : undefined) === expected;
}

function isAfterOrEqual(value: string | undefined, startedAt: Date) {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= startedAt.getTime();
}

function findResourceDelivery(
  deliveries: WebhookDelivery[],
  input: { eventType: string; resourceType: string; resourceId?: string | null },
) {
  if (!input.resourceId) {
    return undefined;
  }

  const matchingDeliveries = deliveries.filter(
    (delivery) =>
      delivery.eventType === input.eventType &&
      delivery.payload?.resource?.type === input.resourceType &&
      delivery.payload?.resource?.id === input.resourceId,
  );

  return (
    matchingDeliveries.find((delivery) => isSucceededDelivery(delivery)) ?? matchingDeliveries[0]
  );
}

function isSucceededDelivery(delivery: WebhookDelivery | undefined) {
  return delivery?.status === 'succeeded';
}

function formatDelivery(delivery: WebhookDelivery | undefined) {
  if (!delivery) {
    return 'missing';
  }
  const statusCode = delivery.lastStatusCode ? ` statusCode=${delivery.lastStatusCode}` : '';
  const attempts = delivery.attemptCount ? ` attempts=${delivery.attemptCount}` : '';
  const error = delivery.lastError ? ` error=${delivery.lastError}` : '';
  return `${delivery.id} ${delivery.eventType} status=${delivery.status}${statusCode}${attempts}${error}`;
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

async function getList<T>(path: string) {
  return request<T[]>('GET', path);
}

async function post<T>(path: string, body: unknown) {
  return request<T>('POST', path, body);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error('\nVukho inbound smoke failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
