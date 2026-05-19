import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  function createController(config: Record<string, string | undefined> = {}) {
    return new HealthController({
      get: jest.fn((key: string, fallback?: string) => config[key] ?? fallback),
    } as unknown as ConfigService);
  }

  it('returns Vukho health metadata', () => {
    const controller = createController();

    expect(controller.getHealth()).toEqual({
      data: {
        name: 'Vukho',
        phase: 'production_backend_flows',
        status: 'ok',
      },
    });
  });

  it('returns secret-safe provider readiness', () => {
    const controller = createController({
      APP_ENV: 'local',
      TELECOM_PROVIDER: 'twilio',
      TWILIO_MODE: 'test',
      TWILIO_TEST_ACCOUNT_SID: 'AC_test',
      TWILIO_TEST_AUTH_TOKEN: 'test_secret',
      TWILIO_INBOUND_SMS_WEBHOOK_URL: 'https://example.com/inbound',
      STRIPE_SECRET_KEY: 'sk_test_secret',
    });

    expect(controller.getProviderHealth()).toEqual({
      data: expect.objectContaining({
        appEnv: 'local',
        releaseReady: false,
        releaseBlockers: expect.arrayContaining([
          'Stripe webhook secret is not configured.',
          'Brevo transactional email is not configured.',
        ]),
        telecom: expect.objectContaining({
          provider: 'twilio',
          ready: true,
          mockAllowed: false,
        }),
        twilio: expect.objectContaining({
          mode: 'test',
          configured: true,
          accountConfigured: true,
          authConfigured: true,
          callbacks: expect.objectContaining({
            inboundSms: true,
            voiceGather: false,
          }),
          publicApiConfigured: false,
          notes: ['Twilio test credentials do not trigger callbacks or receive inbound SMS/calls.'],
        }),
        stripe: expect.objectContaining({
          mode: 'test',
          configured: true,
        }),
      }),
    });
  });

  it('marks live-dev release ready only when callback, billing, and email dependencies are ready', () => {
    const controller = createController({
      APP_ENV: 'local',
      TELECOM_PROVIDER: 'twilio',
      TWILIO_MODE: 'live-dev',
      TWILIO_ACCOUNT_SID: 'AC_live',
      TWILIO_AUTH_TOKEN: 'live_secret',
      PUBLIC_API_URL: 'https://example.ngrok-free.dev',
      TWILIO_INBOUND_SMS_WEBHOOK_URL:
        'https://example.ngrok-free.dev/v1/providers/twilio/sms/inbound',
      TWILIO_MESSAGE_STATUS_CALLBACK_URL:
        'https://example.ngrok-free.dev/v1/providers/twilio/sms/status',
      TWILIO_VOICE_WEBHOOK_URL: 'https://example.ngrok-free.dev/v1/providers/twilio/voice/inbound',
      TWILIO_VOICE_GATHER_CALLBACK_URL:
        'https://example.ngrok-free.dev/v1/providers/twilio/voice/gather',
      TWILIO_VOICE_STATUS_CALLBACK_URL:
        'https://example.ngrok-free.dev/v1/providers/twilio/voice/status',
      STRIPE_SECRET_KEY: 'sk_test_secret',
      STRIPE_WEBHOOK_SECRET: 'whsec_secret',
      BREVO_API_KEY: 'brevo_secret',
      BREVO_FROM_EMAIL: 'hello@example.com',
    });

    expect(controller.getProviderHealth()).toEqual({
      data: expect.objectContaining({
        releaseReady: true,
        releaseBlockers: [],
        twilio: expect.objectContaining({
          callbacks: expect.objectContaining({
            inboundSms: true,
            messageStatus: true,
            voice: true,
            voiceGather: true,
            voiceStatus: true,
          }),
          publicApiConfigured: true,
        }),
      }),
    });
  });

  it('can be compiled by Nest testing module', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
  });
});
