import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { success } from '../../common/api/api-response';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  getHealth() {
    return success({
      name: 'Vukho',
      phase: 'production_backend_flows',
      status: 'ok',
    });
  }

  @Get('providers')
  getProviderHealth() {
    const appEnv = this.config.get<string>('APP_ENV');
    const telecomProvider = this.config.get<string>('TELECOM_PROVIDER');
    const twilioMode = this.config.get<string>('TWILIO_MODE');
    const twilioConfigured = this.isTwilioConfigured(twilioMode);
    const twilioCallbacks = {
      inboundSms: this.hasConfig('TWILIO_INBOUND_SMS_WEBHOOK_URL'),
      messageStatus: this.hasConfig('TWILIO_MESSAGE_STATUS_CALLBACK_URL'),
      numberStatus: this.hasConfig('TWILIO_NUMBER_STATUS_CALLBACK_URL'),
      voice: this.hasConfig('TWILIO_VOICE_WEBHOOK_URL'),
      voiceGather: this.hasConfig('TWILIO_VOICE_GATHER_CALLBACK_URL'),
      voiceStatus: this.hasConfig('TWILIO_VOICE_STATUS_CALLBACK_URL'),
    };
    const stripeConfigured = this.hasConfig('STRIPE_SECRET_KEY');
    const stripeWebhookConfigured = this.hasConfig('STRIPE_WEBHOOK_SECRET');
    const brevoConfigured = this.hasConfig('BREVO_API_KEY') && this.hasConfig('BREVO_FROM_EMAIL');
    const releaseBlockers = this.getReleaseBlockers({
      appEnv,
      telecomProvider,
      twilioMode,
      twilioConfigured,
      twilioCallbacks,
      stripeConfigured,
      stripeWebhookConfigured,
      brevoConfigured,
    });

    return success({
      appEnv,
      releaseReady: releaseBlockers.length === 0,
      releaseBlockers,
      telecom: {
        provider: telecomProvider,
        ready: telecomProvider === 'twilio' ? twilioConfigured : telecomProvider === 'mock',
        mockAllowed: appEnv === 'test',
      },
      twilio: {
        mode: twilioMode,
        configured: twilioConfigured,
        accountConfigured:
          twilioMode === 'test'
            ? this.hasConfig('TWILIO_TEST_ACCOUNT_SID')
            : this.hasConfig('TWILIO_ACCOUNT_SID'),
        authConfigured:
          twilioMode === 'test'
            ? this.hasConfig('TWILIO_TEST_AUTH_TOKEN')
            : this.hasConfig('TWILIO_AUTH_TOKEN'),
        callbacks: twilioCallbacks,
        publicApiConfigured: this.hasPublicApiUrl(),
        notes:
          twilioMode === 'test'
            ? ['Twilio test credentials do not trigger callbacks or receive inbound SMS/calls.']
            : [],
      },
      stripe: {
        mode: this.config.get<string>('STRIPE_MODE', 'test'),
        configured: stripeConfigured,
        webhookConfigured: stripeWebhookConfigured,
      },
      brevo: {
        configured: brevoConfigured,
        apiKeyConfigured: this.hasConfig('BREVO_API_KEY'),
        fromEmailConfigured: this.hasConfig('BREVO_FROM_EMAIL'),
      },
    });
  }

  private isTwilioConfigured(mode: string | undefined) {
    if (mode === 'test') {
      return this.hasConfig('TWILIO_TEST_ACCOUNT_SID') && this.hasConfig('TWILIO_TEST_AUTH_TOKEN');
    }

    return this.hasConfig('TWILIO_ACCOUNT_SID') && this.hasConfig('TWILIO_AUTH_TOKEN');
  }

  private hasConfig(key: string) {
    const value = this.config.get<string>(key);
    return Boolean(value && value.trim().length > 0);
  }

  private hasPublicApiUrl() {
    const value = this.config.get<string>('PUBLIC_API_URL');
    return Boolean(value?.startsWith('https://'));
  }

  private getReleaseBlockers(input: {
    appEnv?: string;
    telecomProvider?: string;
    twilioMode?: string;
    twilioConfigured: boolean;
    twilioCallbacks: Record<string, boolean>;
    stripeConfigured: boolean;
    stripeWebhookConfigured: boolean;
    brevoConfigured: boolean;
  }) {
    const blockers: string[] = [];

    if (input.appEnv !== 'test' && input.telecomProvider === 'mock') {
      blockers.push('Mock telecom provider is not allowed outside tests.');
    }
    if (input.telecomProvider !== 'twilio') {
      blockers.push('Telecom provider must be twilio for release smoke.');
    }
    if (!input.twilioConfigured) {
      blockers.push('Twilio credentials are not configured.');
    }
    if (input.twilioMode !== 'test' && !this.hasPublicApiUrl()) {
      blockers.push('PUBLIC_API_URL must be an https URL for live Twilio callbacks.');
    }
    if (input.twilioMode !== 'test') {
      for (const [name, configured] of Object.entries(input.twilioCallbacks)) {
        if (!configured && name !== 'numberStatus') {
          blockers.push(`Twilio ${name} callback URL is not configured.`);
        }
      }
    }
    if (!input.stripeConfigured) {
      blockers.push('Stripe secret key is not configured.');
    }
    if (!input.stripeWebhookConfigured) {
      blockers.push('Stripe webhook secret is not configured.');
    }
    if (!input.brevoConfigured) {
      blockers.push('Brevo transactional email is not configured.');
    }

    return blockers;
  }
}
