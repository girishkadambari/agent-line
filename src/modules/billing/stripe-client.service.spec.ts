import { createHmac } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

import { StripeClientService } from './stripe-client.service';

function signatureFor(payload: string, secret: string, timestamp: number) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('StripeClientService', () => {
  function createService(nowSeconds: number, toleranceSeconds = 300) {
    jest.spyOn(Date, 'now').mockReturnValue(nowSeconds * 1000);
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
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
});
