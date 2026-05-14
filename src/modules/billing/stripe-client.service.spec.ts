import { createHmac } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

import { StripeClientService } from './stripe-client.service';

function signatureFor(payload: string, secret: string, timestamp: number) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('StripeClientService', () => {
  function createService(
    nowSeconds: number,
    toleranceSeconds = 300,
    overrides: Record<string, unknown> = {},
  ) {
    jest.spyOn(Date, 'now').mockReturnValue(nowSeconds * 1000);
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key in overrides) {
          return overrides[key];
        }
        if (key === 'STRIPE_MODE') {
          return 'test';
        }
        if (key === 'STRIPE_WEBHOOK_SECRET') {
          return 'whsec_test';
        }
        if (key === 'STRIPE_WEBHOOK_TOLERANCE_SECONDS') {
          return toleranceSeconds;
        }
        return fallback;
      }),
    } as unknown as ConfigService;

    return new StripeClientService(config);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('constructs event for valid signature inside timestamp tolerance', () => {
    const payload = JSON.stringify({
      id: 'evt_123',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: {} },
    });
    const service = createService(1_777_777_777);

    const event = service.constructWebhookEvent(
      Buffer.from(payload),
      signatureFor(payload, 'whsec_test', 1_777_777_760),
    );

    expect(event.id).toBe('evt_123');
  });

  it('rejects stale Stripe signature timestamp', () => {
    const payload = JSON.stringify({
      id: 'evt_123',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: {} },
    });
    const service = createService(1_777_777_777);

    try {
      service.constructWebhookEvent(
        Buffer.from(payload),
        signatureFor(payload, 'whsec_test', 1_777_777_000),
      );
      throw new Error('Expected stale signature to throw.');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'unauthorized',
      });
      expect((error as { getResponse: () => unknown }).getResponse()).toEqual({
        error: {
          code: 'unauthorized',
          message: 'Stripe signature timestamp is outside tolerance.',
          details: {},
        },
      });
    }
  });

  it('rejects webhook events from the wrong Stripe mode', () => {
    const payload = JSON.stringify({
      id: 'evt_live',
      type: 'checkout.session.completed',
      livemode: true,
      data: { object: {} },
    });
    const service = createService(1_777_777_777, 300, { STRIPE_MODE: 'test' });

    try {
      service.constructWebhookEvent(
        Buffer.from(payload),
        signatureFor(payload, 'whsec_test', 1_777_777_760),
      );
      throw new Error('Expected wrong-mode webhook to throw.');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'unauthorized',
      });
      expect((error as { getResponse: () => unknown }).getResponse()).toEqual({
        error: {
          code: 'unauthorized',
          message: 'Stripe webhook event mode does not match STRIPE_MODE=test.',
          details: {},
        },
      });
    }
  });

  it('reports Stripe configuration status for test mode', () => {
    const service = createService(1_777_777_777, 300, {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_MODE: 'test',
    });

    expect(service.getConfigurationStatus()).toEqual({
      mode: 'test',
      secretKeyConfigured: true,
      secretKeyMatchesMode: true,
      webhookSecretConfigured: true,
      webhookToleranceSeconds: 300,
      usageMeterEventNameConfigured: false,
    });
  });

  it('creates a Stripe billing meter event with usage trace payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        identifier: 'use_123',
        event_name: 'agentline_usage',
      }),
    });
    global.fetch = fetchMock;
    const service = createService(1_777_777_777, 300, {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_MODE: 'test',
      STRIPE_USAGE_METER_EVENT_NAME: 'agentline_usage',
    });

    const result = await service.createUsageMeterEvent({
      identifier: 'use_123',
      customerId: 'cus_123',
      value: 6,
      usageEventId: 'use_123',
      workspaceId: 'ws_123',
      projectId: 'proj_123',
      resourceType: 'call',
      resourceId: 'call_123',
      channel: 'voice',
      timestamp: new Date('2026-05-07T00:00:00.000Z'),
    });

    expect(result.identifier).toBe('use_123');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/billing/meter_events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_123',
        }),
      }),
    );
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('event_name')).toBe('agentline_usage');
    expect(body.get('identifier')).toBe('use_123');
    expect(body.get('payload[stripe_customer_id]')).toBe('cus_123');
    expect(body.get('payload[value]')).toBe('6');
    expect(body.get('payload[usage_event_id]')).toBe('use_123');
    expect(body.get('payload[resource_id]')).toBe('call_123');
  });

  it('reports usage meter configuration status', () => {
    const service = createService(1_777_777_777, 300, {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_USAGE_METER_EVENT_NAME: 'agentline_usage',
    });

    expect(service.getConfigurationStatus()).toMatchObject({
      usageMeterEventNameConfigured: true,
    });
  });

  it('reports mismatched Stripe secret key mode', () => {
    const service = createService(1_777_777_777, 300, {
      STRIPE_SECRET_KEY: 'sk_live_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_MODE: 'test',
    });

    expect(service.getConfigurationStatus()).toMatchObject({
      mode: 'test',
      secretKeyConfigured: true,
      secretKeyMatchesMode: false,
    });
  });

  it('accepts restricted keys for the configured Stripe mode', () => {
    const service = createService(1_777_777_777, 300, {
      STRIPE_SECRET_KEY: 'rk_live_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_live',
      STRIPE_MODE: 'live',
    });

    expect(service.getConfigurationStatus()).toMatchObject({
      mode: 'live',
      secretKeyConfigured: true,
      secretKeyMatchesMode: true,
    });
  });
});
