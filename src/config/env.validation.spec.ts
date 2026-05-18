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

  it('requires Twilio callback URLs for live-dev mode', () => {
    expect(() =>
      validateEnv({
        APP_ENV: 'local',
        TELECOM_PROVIDER: 'twilio',
        TWILIO_MODE: 'live-dev',
        TWILIO_ACCOUNT_SID: 'AC_live',
        TWILIO_AUTH_TOKEN: 'live_secret',
      }),
    ).toThrow('TWILIO_INBOUND_SMS_WEBHOOK_URL is required');
  });

  it('accepts live-dev Twilio config when all live callback URLs are configured', () => {
    const config = validateEnv({
      APP_ENV: 'local',
      TELECOM_PROVIDER: 'twilio',
      TWILIO_MODE: 'live-dev',
      TWILIO_ACCOUNT_SID: 'AC_live',
      TWILIO_AUTH_TOKEN: 'live_secret',
      TWILIO_INBOUND_SMS_WEBHOOK_URL: 'https://vukho.test/v1/providers/twilio/sms/inbound',
      TWILIO_MESSAGE_STATUS_CALLBACK_URL: 'https://vukho.test/v1/providers/twilio/sms/status',
      TWILIO_VOICE_WEBHOOK_URL: 'https://vukho.test/v1/providers/twilio/voice/inbound',
      TWILIO_VOICE_GATHER_CALLBACK_URL: 'https://vukho.test/v1/providers/twilio/voice/gather',
      TWILIO_VOICE_STATUS_CALLBACK_URL: 'https://vukho.test/v1/providers/twilio/voice/status',
    });

    expect(config).toMatchObject({
      APP_ENV: 'local',
      TELECOM_PROVIDER: 'twilio',
      TWILIO_MODE: 'live-dev',
    });
  });

  it('requires production to use Twilio live mode', () => {
    expect(() =>
      validateEnv({
        APP_ENV: 'production',
        TELECOM_PROVIDER: 'twilio',
        TWILIO_MODE: 'live-dev',
        TWILIO_ACCOUNT_SID: 'AC_live',
        TWILIO_AUTH_TOKEN: 'live_secret',
        TWILIO_INBOUND_SMS_WEBHOOK_URL: 'https://vukho.test/v1/providers/twilio/sms/inbound',
        TWILIO_MESSAGE_STATUS_CALLBACK_URL: 'https://vukho.test/v1/providers/twilio/sms/status',
        TWILIO_VOICE_WEBHOOK_URL: 'https://vukho.test/v1/providers/twilio/voice/inbound',
        TWILIO_VOICE_GATHER_CALLBACK_URL: 'https://vukho.test/v1/providers/twilio/voice/gather',
        TWILIO_VOICE_STATUS_CALLBACK_URL: 'https://vukho.test/v1/providers/twilio/voice/status',
      }),
    ).toThrow('APP_ENV=production requires TWILIO_MODE=live');
  });
});
