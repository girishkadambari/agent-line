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

    return success({
      appEnv,
      telecom: {
        provider: telecomProvider,
        ready: telecomProvider === 'twilio' ? this.isTwilioConfigured(twilioMode) : telecomProvider === 'mock',
        mockAllowed: appEnv === 'test',
      },
      twilio: {
        mode: twilioMode,
        configured: this.isTwilioConfigured(twilioMode),
        accountConfigured:
          twilioMode === 'test'
            ? this.hasConfig('TWILIO_TEST_ACCOUNT_SID')
            : this.hasConfig('TWILIO_ACCOUNT_SID'),
        authConfigured:
          twilioMode === 'test'
            ? this.hasConfig('TWILIO_TEST_AUTH_TOKEN')
            : this.hasConfig('TWILIO_AUTH_TOKEN'),
        callbacks: {
          inboundSms: this.hasConfig('TWILIO_INBOUND_SMS_WEBHOOK_URL'),
          messageStatus: this.hasConfig('TWILIO_MESSAGE_STATUS_CALLBACK_URL'),
          numberStatus: this.hasConfig('TWILIO_NUMBER_STATUS_CALLBACK_URL'),
          voice: this.hasConfig('TWILIO_VOICE_WEBHOOK_URL'),
          voiceStatus: this.hasConfig('TWILIO_VOICE_STATUS_CALLBACK_URL'),
        },
        notes:
          twilioMode === 'test'
            ? ['Twilio test credentials do not trigger callbacks or receive inbound SMS/calls.']
            : [],
      },
      stripe: {
        mode: this.config.get<string>('STRIPE_MODE', 'test'),
        configured: this.hasConfig('STRIPE_SECRET_KEY'),
        webhookConfigured: this.hasConfig('STRIPE_WEBHOOK_SECRET'),
      },
      brevo: {
        configured: this.hasConfig('BREVO_API_KEY') && this.hasConfig('BREVO_FROM_EMAIL'),
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
}
