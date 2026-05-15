import type { ConfigService } from '@nestjs/config';

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
      TWILIO_MODE: 'live-dev',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_MESSAGE_STATUS_CALLBACK_URL: 'https://api.agentline.dev/v1/providers/twilio/sms/status',
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
    const requestBody = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(requestBody.get('StatusCallback')).toBe('https://api.agentline.dev/v1/providers/twilio/sms/status');
  });

  it('searches available numbers and normalizes capabilities', async () => {
    const service = createService({
      TWILIO_MODE: 'live-dev',
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

  it('provisions numbers with inbound SMS callback settings', async () => {
    const service = createService({
      TWILIO_MODE: 'live-dev',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_INBOUND_SMS_WEBHOOK_URL: 'https://api.agentline.dev/v1/providers/twilio/sms/inbound',
      TWILIO_NUMBER_STATUS_CALLBACK_URL: 'https://api.agentline.dev/v1/providers/twilio/number/status',
      TWILIO_VOICE_WEBHOOK_URL: 'https://api.agentline.dev/v1/providers/twilio/voice/inbound',
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          available_phone_numbers: [
            {
              phone_number: '+14155550100',
              iso_country: 'US',
              capabilities: { SMS: true, MMS: false, voice: true },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          sid: 'PN123',
          phone_number: '+14155550100',
          iso_country: 'US',
          capabilities: { SMS: true, MMS: false, voice: true },
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await service.provisionNumber({
      workspaceId: 'ws_123',
      projectId: 'proj_123',
      country: 'US',
      capabilities: ['sms', 'voice'],
    });

    const requestBody = fetchMock.mock.calls[1][1].body as URLSearchParams;
    expect(requestBody.get('SmsUrl')).toBe('https://api.agentline.dev/v1/providers/twilio/sms/inbound');
    expect(requestBody.get('SmsMethod')).toBe('POST');
    expect(requestBody.get('VoiceUrl')).toBe('https://api.agentline.dev/v1/providers/twilio/voice/inbound');
    expect(requestBody.get('VoiceMethod')).toBe('POST');
    expect(requestBody.get('StatusCallback')).toBe('https://api.agentline.dev/v1/providers/twilio/number/status');
  });

  it('provisions a Twilio test-mode number without searching available numbers first', async () => {
    const service = createService({
      TWILIO_MODE: 'test',
      TWILIO_TEST_ACCOUNT_SID: 'AC_test',
      TWILIO_TEST_AUTH_TOKEN: 'test_secret',
      TWILIO_FROM_NUMBER: '+15005550006',
    });
    const fetchMock = mockFetch({
      sid: 'PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      phone_number: '+15005550006',
      iso_country: 'US',
      capabilities: { SMS: true, MMS: false, voice: true },
    });

    await expect(
      service.provisionNumber({
        workspaceId: 'ws_123',
        projectId: 'proj_123',
        country: 'US',
        areaCode: '415',
        capabilities: ['sms', 'voice'],
      }),
    ).resolves.toEqual({
      provider: 'twilio',
      providerNumberId: 'PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      phoneNumber: '+15005550006',
      country: 'US',
      areaCode: '415',
      capabilities: ['sms', 'voice'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC_test/IncomingPhoneNumbers.json',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestBody = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(requestBody.get('PhoneNumber')).toBe('+15005550006');
  });

  it('imports an existing Twilio number and configures AgentLine callbacks', async () => {
    const service = createService({
      TWILIO_MODE: 'live-dev',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_INBOUND_SMS_WEBHOOK_URL: 'https://api.agentline.dev/v1/providers/twilio/sms/inbound',
      TWILIO_NUMBER_STATUS_CALLBACK_URL: 'https://api.agentline.dev/v1/providers/twilio/number/status',
      TWILIO_VOICE_WEBHOOK_URL: 'https://api.agentline.dev/v1/providers/twilio/voice/inbound',
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          incoming_phone_numbers: [
            {
              sid: 'PN123',
              phone_number: '+19012316325',
              iso_country: 'US',
              capabilities: { SMS: true, MMS: false, voice: true },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          sid: 'PN123',
          phone_number: '+19012316325',
          iso_country: 'US',
          capabilities: { SMS: true, MMS: false, voice: true },
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      service.importNumber({
        phoneNumber: '+19012316325',
        capabilities: ['sms', 'voice'],
      }),
    ).resolves.toEqual({
      provider: 'twilio',
      providerNumberId: 'PN123',
      phoneNumber: '+19012316325',
      country: 'US',
      capabilities: ['sms', 'voice'],
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/IncomingPhoneNumbers.json?PhoneNumber=%2B19012316325',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/IncomingPhoneNumbers/PN123.json',
    );
    const requestBody = fetchMock.mock.calls[1][1].body as URLSearchParams;
    expect(requestBody.get('SmsUrl')).toBe('https://api.agentline.dev/v1/providers/twilio/sms/inbound');
    expect(requestBody.get('VoiceUrl')).toBe('https://api.agentline.dev/v1/providers/twilio/voice/inbound');
    expect(requestBody.get('StatusCallback')).toBe('https://api.agentline.dev/v1/providers/twilio/number/status');
  });

  it('returns the Twilio test magic number for search in test mode', async () => {
    const service = createService({
      TWILIO_MODE: 'test',
      TWILIO_FROM_NUMBER: '+15005550006',
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      service.searchNumbers({ country: 'US', areaCode: '415', capabilities: ['sms', 'voice'] }),
    ).resolves.toEqual({
      numbers: [
        {
          phoneNumber: '+15005550006',
          country: 'US',
          areaCode: '415',
          capabilities: ['sms', 'voice'],
        },
      ],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call Twilio to release a number in test mode', async () => {
    const service = createService({
      TWILIO_MODE: 'test',
      TWILIO_TEST_ACCOUNT_SID: 'AC_test',
      TWILIO_TEST_AUTH_TOKEN: 'test_secret',
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.releaseNumber({ providerNumberId: 'PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).resolves.toEqual({
      released: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces Twilio API errors as provider errors', async () => {
    const service = createService({
      TWILIO_MODE: 'live-dev',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
    });
    mockFetch({ code: 20003, message: 'Authentication Error' }, 401);

    await expect(service.searchNumbers({ country: 'US', capabilities: ['sms'] })).rejects.toMatchObject({
      code: 'provider_error',
      status: 502,
    });
  });

  it('uses Twilio test credentials in test mode', async () => {
    const service = createService({
      TWILIO_MODE: 'test',
      TWILIO_ACCOUNT_SID: 'AC_live',
      TWILIO_AUTH_TOKEN: 'live_secret',
      TWILIO_TEST_ACCOUNT_SID: 'AC_test',
      TWILIO_TEST_AUTH_TOKEN: 'test_secret',
    });
    const fetchMock = mockFetch({ sid: 'SM123', status: 'queued' });

    await service.sendSms({ from: '+15005550006', to: '+14155550123', body: 'Hello' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('AC_test:test_secret').toString('base64')}`,
        }),
      }),
    );
  });

  it('creates calls with repeated Twilio status callback events', async () => {
    const service = createService({
      TWILIO_MODE: 'live-dev',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_VOICE_WEBHOOK_URL: 'https://api.agentline.dev/v1/providers/twilio/voice/inbound',
      TWILIO_VOICE_STATUS_CALLBACK_URL: 'https://api.agentline.dev/v1/providers/twilio/voice/status',
    });
    const fetchMock = mockFetch({ sid: 'CA123', status: 'queued', duration: '0' });

    await expect(service.createCall({ from: '+19012316325', to: '+917799027234' })).resolves.toEqual({
      provider: 'twilio',
      providerCallId: 'CA123',
      status: 'queued',
      durationSeconds: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Calls.json',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestBody = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(requestBody.get('Url')).toBe('https://api.agentline.dev/v1/providers/twilio/voice/inbound');
    expect(requestBody.get('StatusCallback')).toBe('https://api.agentline.dev/v1/providers/twilio/voice/status');
    expect(requestBody.get('StatusCallbackMethod')).toBe('POST');
    expect(requestBody.getAll('StatusCallbackEvent')).toEqual([
      'initiated',
      'ringing',
      'answered',
      'completed',
    ]);
  });

  it('rejects call creation when the voice status callback URL is missing', async () => {
    const service = createService({
      TWILIO_MODE: 'live-dev',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_VOICE_WEBHOOK_URL: 'https://api.agentline.dev/v1/providers/twilio/voice/inbound',
    });

    await expect(service.createCall({ from: '+19012316325', to: '+917799027234' })).rejects.toMatchObject({
      response: {
        error: {
          code: 'provider_error',
          message: 'TWILIO_VOICE_STATUS_CALLBACK_URL is required for Twilio calls.',
        },
      },
    });
  });
});
