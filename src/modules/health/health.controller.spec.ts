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
          notes: ['Twilio test credentials do not trigger callbacks or receive inbound SMS/calls.'],
        }),
        stripe: expect.objectContaining({
          mode: 'test',
          configured: true,
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
