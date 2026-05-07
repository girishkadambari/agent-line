import type { ConfigService } from '@nestjs/config';

import { ApiException } from '../../../common/errors/api.exception';
import { TwilioSignatureService } from './twilio-signature.service';

describe('TwilioSignatureService', () => {
  function createService(config: Record<string, string | undefined>) {
    return new TwilioSignatureService({
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService);
  }

  it('verifies a valid Twilio callback signature', () => {
    const service = createService({ TWILIO_AUTH_TOKEN: 'secret' });
    const params = {
      Body: 'Hello',
      From: '+14155550123',
      MessageSid: 'SM123',
      To: '+14155559999',
    };
    const signature = service.createSignature(
      'https://api.agentline.dev/v1/providers/twilio/sms/inbound',
      params,
      'secret',
    );

    expect(() =>
      service.verifyCallback({
        configuredUrl: 'https://api.agentline.dev/v1/providers/twilio/sms/inbound',
        params,
        signature,
      }),
    ).not.toThrow();
  });

  it('rejects invalid callback signatures', () => {
    const service = createService({ TWILIO_AUTH_TOKEN: 'secret' });

    expect(() =>
      service.verifyCallback({
        configuredUrl: 'https://api.agentline.dev/v1/providers/twilio/sms/inbound',
        params: { MessageSid: 'SM123' },
        signature: 'bad-signature',
      }),
    ).toThrow(ApiException);
  });
});
