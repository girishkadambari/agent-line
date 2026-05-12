import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { TelecomProvider } from '../../domain/provider';
import { ApiException } from '../../common/errors/api.exception';
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
        const provider = config.get<string>('TELECOM_PROVIDER');
        if (provider === 'twilio') {
          return twilioProvider;
        }
        if (provider === 'mock') {
          return mockProvider;
        }

        throw new ApiException('provider_error', 'Unsupported telecom provider configured.', 500, {
          provider,
        });
      },
    },
  ],
  exports: [TELECOM_PROVIDER, MockProviderService, TwilioProviderService],
})
export class ProvidersModule {}
