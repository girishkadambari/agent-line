import { z } from 'zod';

const appEnvSchema = z.enum(['local', 'test', 'staging', 'production']);
const telecomProviderSchema = z.enum(['mock', 'twilio']);
const twilioModeSchema = z.enum(['test', 'live-dev', 'live']);

export type AppEnv = z.infer<typeof appEnvSchema>;
export type TelecomProviderName = z.infer<typeof telecomProviderSchema>;
export type TwilioMode = z.infer<typeof twilioModeSchema>;

const rawEnvSchema = z
  .object({
    APP_ENV: z.string().optional(),
    NODE_ENV: z.string().optional(),
    TELECOM_PROVIDER: z.string().optional(),
    TWILIO_MODE: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_TEST_ACCOUNT_SID: z.string().optional(),
    TWILIO_TEST_AUTH_TOKEN: z.string().optional(),
  })
  .passthrough();

export function validateEnv(rawConfig: Record<string, unknown>) {
  const parsed = rawEnvSchema.parse(rawConfig);
  const appEnv = resolveAppEnv(parsed.APP_ENV, parsed.NODE_ENV);
  const telecomProvider = resolveTelecomProvider(parsed.TELECOM_PROVIDER, appEnv);
  const twilioMode = resolveTwilioMode(parsed.TWILIO_MODE, appEnv);

  validateMockPolicy({ appEnv, telecomProvider });
  validateTwilioConfig({ appEnv, telecomProvider, twilioMode, parsed });

  return {
    ...rawConfig,
    APP_ENV: appEnv,
    TELECOM_PROVIDER: telecomProvider,
    TWILIO_MODE: twilioMode,
  };
}

function resolveAppEnv(appEnv: string | undefined, nodeEnv: string | undefined): AppEnv {
  if (appEnv) {
    return appEnvSchema.parse(appEnv);
  }
  if (nodeEnv === 'test') {
    return 'test';
  }
  if (nodeEnv === 'production') {
    return 'production';
  }
  return 'local';
}

function resolveTelecomProvider(provider: string | undefined, appEnv: AppEnv): TelecomProviderName {
  if (provider) {
    return telecomProviderSchema.parse(provider);
  }
  return appEnv === 'test' ? 'mock' : 'twilio';
}

function resolveTwilioMode(mode: string | undefined, appEnv: AppEnv): TwilioMode {
  if (mode) {
    return twilioModeSchema.parse(mode);
  }
  if (appEnv === 'production') {
    return 'live';
  }
  if (appEnv === 'staging') {
    return 'live-dev';
  }
  return 'test';
}

function validateMockPolicy(input: { appEnv: AppEnv; telecomProvider: TelecomProviderName }) {
  if (input.telecomProvider !== 'mock') {
    return;
  }
  if (input.appEnv === 'test') {
    return;
  }

  throw new Error(
    `TELECOM_PROVIDER=mock is only allowed when APP_ENV=test. Current APP_ENV=${input.appEnv}. Use TELECOM_PROVIDER=twilio with TWILIO_MODE=test for local development.`,
  );
}

function validateTwilioConfig(input: {
  appEnv: AppEnv;
  telecomProvider: TelecomProviderName;
  twilioMode: TwilioMode;
  parsed: z.infer<typeof rawEnvSchema>;
}) {
  if (input.telecomProvider !== 'twilio') {
    return;
  }

  if (input.twilioMode === 'test') {
    requireEnv(input.parsed.TWILIO_TEST_ACCOUNT_SID, 'TWILIO_TEST_ACCOUNT_SID');
    requireEnv(input.parsed.TWILIO_TEST_AUTH_TOKEN, 'TWILIO_TEST_AUTH_TOKEN');
    return;
  }

  requireEnv(input.parsed.TWILIO_ACCOUNT_SID, 'TWILIO_ACCOUNT_SID');
  requireEnv(input.parsed.TWILIO_AUTH_TOKEN, 'TWILIO_AUTH_TOKEN');

  if (input.appEnv === 'production' && input.twilioMode !== 'live') {
    throw new Error('APP_ENV=production requires TWILIO_MODE=live.');
  }
}

function requireEnv(value: string | undefined, name: string) {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required for the selected provider mode.`);
  }
}

