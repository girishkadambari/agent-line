import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { TelecomProvider } from '../../domain/provider';
import { MockProviderService } from './mock/mock-provider.service';
import { TELECOM_PROVIDER } from './providers.constants';
import { TwilioProviderService } from './twilio/twilio-provider.service';

@Module({
  providers: [
    MockProviderService,
    TwilioProviderService,
    {
      provide: TELECOM_PROVIDER,
      inject: [ConfigService, MockProviderService, TwilioProviderService],
      useFactory: (
        config: ConfigService,
        mockProvider: MockProviderService,
        twilioProvider: TwilioProviderService,
      ): TelecomProvider => {
        const provider = config.get<string>('TELECOM_PROVIDER', 'mock');
        return provider === 'twilio' ? twilioProvider : mockProvider;
      },
    },
  ],
  exports: [TELECOM_PROVIDER, MockProviderService, TwilioProviderService],
})
export class ProvidersModule {}
