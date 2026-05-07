import { createHmac } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

import { StripeClientService } from './stripe-client.service';

function signatureFor(payload: string, secret: string, timestamp: number) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('StripeClientService', () => {
  function createService(nowSeconds: number, toleranceSeconds = 300, overrides: Record<string, unknown> = {}) {
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
