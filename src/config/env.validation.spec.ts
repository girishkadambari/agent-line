import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('defaults local development to Twilio test mode', () => {
    const config = validateEnv({
      NODE_ENV: 'development',
      TWILIO_TEST_ACCOUNT_SID: 'AC_test',
      TWILIO_TEST_AUTH_TOKEN: 'test_secret',
    });

    expect(config).toMatchObject({
      APP_ENV: 'local',
      TELECOM_PROVIDER: 'twilio',
      TWILIO_MODE: 'test',
    });
  });

  it('allows mock only for test environment', () => {
    const config = validateEnv({
      NODE_ENV: 'test',
      TELECOM_PROVIDER: 'mock',
    });

    expect(config).toMatchObject({
      APP_ENV: 'test',
      TELECOM_PROVIDER: 'mock',
    });
  });

  it('rejects local mock provider usage', () => {
    expect(() =>
      validateEnv({
        APP_ENV: 'local',
        TELECOM_PROVIDER: 'mock',
      }),
    ).toThrow('TELECOM_PROVIDER=mock is only allowed when APP_ENV=test');
  });

  it('rejects production mock provider usage', () => {
    expect(() =>
      validateEnv({
        APP_ENV: 'production',
        TELECOM_PROVIDER: 'mock',
      }),
    ).toThrow('TELECOM_PROVIDER=mock is only allowed when APP_ENV=test');
  });

  it('requires Twilio test credentials for Twilio test mode', () => {
    expect(() =>
      validateEnv({
        APP_ENV: 'local',
        TELECOM_PROVIDER: 'twilio',
        TWILIO_MODE: 'test',
      }),
    ).toThrow('TWILIO_TEST_ACCOUNT_SID is required');
  });

  it('requires live Twilio credentials for live-dev mode', () => {
    expect(() =>
      validateEnv({
        APP_ENV: 'local',
        TELECOM_PROVIDER: 'twilio',
        TWILIO_MODE: 'live-dev',
      }),
    ).toThrow('TWILIO_ACCOUNT_SID is required');
  });

  it('requires production to use Twilio live mode', () => {
    expect(() =>
      validateEnv({
        APP_ENV: 'production',
        TELECOM_PROVIDER: 'twilio',
        TWILIO_MODE: 'live-dev',
        TWILIO_ACCOUNT_SID: 'AC_live',
        TWILIO_AUTH_TOKEN: 'live_secret',
      }),
    ).toThrow('APP_ENV=production requires TWILIO_MODE=live');
  });
});

