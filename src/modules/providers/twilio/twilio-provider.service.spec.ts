import { ConfigService } from '@nestjs/config';

import { ApiException } from '../../../common/errors/api.exception';
import { TwilioProviderService } from './twilio-provider.service';

describe('TwilioProviderService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createService(config: Record<string, string | undefined> = {}) {
    return new TwilioProviderService({
      get: jest.fn((key: string, fallback?: string) => config[key] ?? fallback),
    } as unknown as ConfigService);
  }

  function mockFetch(payload: unknown, status = 200) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(payload),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('requires Twilio credentials before calling the API', async () => {
    const service = createService();

    await expect(service.sendSms({ from: '+14155550000', to: '+14155550123', body: 'Hello' })).rejects.toThrow(
      ApiException,
    );
  });

  it('sends SMS through Twilio and normalizes delivered status', async () => {
    const service = createService({
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
    });
    const fetchMock = mockFetch({ sid: 'SM123', status: 'delivered' });

    const result = await service.sendSms({ from: '+14155550000', to: '+14155550123', body: 'Hello' });

    expect(result).toEqual({
      provider: 'twilio',
      providerMessageId: 'SM123',
      status: 'delivered',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('AC123:secret').toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }),
    );
  });

  it('searches available numbers and normalizes capabilities', async () => {
    const service = createService({
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
    });
    mockFetch({
      available_phone_numbers: [
        {
          phone_number: '+14155550100',
          iso_country: 'US',
          capabilities: { SMS: true, MMS: true, voice: false },
        },
      ],
    });

    await expect(
      service.searchNumbers({ country: 'US', areaCode: '415', capabilities: ['sms', 'voice'] }),
    ).resolves.toEqual({
      numbers: [
        {
          phoneNumber: '+14155550100',
          country: 'US',
          areaCode: '415',
          capabilities: ['sms', 'mms'],
        },
      ],
    });
  });

  it('surfaces Twilio API errors as provider errors', async () => {
    const service = createService({
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
    });
    mockFetch({ code: 20003, message: 'Authentication Error' }, 401);

    await expect(service.searchNumbers({ country: 'US', capabilities: ['sms'] })).rejects.toMatchObject({
      code: 'provider_error',
      status: 502,
    });
  });
});
