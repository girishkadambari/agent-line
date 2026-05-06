import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiException } from '../../../common/errors/api.exception';
import type {
  CreateCallInput,
  CreateCallResult,
  EndCallInput,
  EndCallResult,
  ProvisionNumberInput,
  ProvisionNumberResult,
  ReleaseNumberInput,
  ReleaseNumberResult,
  SearchNumbersInput,
  SearchNumbersResult,
  SendSmsInput,
  SendSmsResult,
  TelecomProvider,
  TransferCallInput,
  TransferCallResult,
} from '../../../domain/provider';

interface TwilioAvailableNumber {
  phone_number: string;
  iso_country: string;
  capabilities?: {
    SMS?: boolean;
    MMS?: boolean;
    voice?: boolean;
  };
}

interface TwilioIncomingNumber {
  sid: string;
  phone_number: string;
  iso_country?: string;
  capabilities?: TwilioAvailableNumber['capabilities'];
}

interface TwilioMessage {
  sid: string;
  status: string;
}

interface TwilioCall {
  sid: string;
  status: string;
  duration?: string;
}

@Injectable()
export class TwilioProviderService implements TelecomProvider {
  constructor(private readonly config: ConfigService) {}

  async searchNumbers(input: SearchNumbersInput): Promise<SearchNumbersResult> {
    const params = new URLSearchParams();
    if (input.areaCode) {
      params.set('AreaCode', input.areaCode);
    }
    if (input.capabilities.includes('sms')) {
      params.set('SmsEnabled', 'true');
    }
    if (input.capabilities.includes('mms')) {
      params.set('MmsEnabled', 'true');
    }
    if (input.capabilities.includes('voice')) {
      params.set('VoiceEnabled', 'true');
    }

    const response = await this.request<{ available_phone_numbers: TwilioAvailableNumber[] }>(
      'GET',
      `/AvailablePhoneNumbers/${input.country}/Local.json?${params.toString()}`,
    );

    return {
      numbers: response.available_phone_numbers.map((number) => ({
        phoneNumber: number.phone_number,
        country: number.iso_country,
        areaCode: input.areaCode,
        capabilities: this.normalizeCapabilities(number.capabilities),
      })),
    };
  }

  async provisionNumber(input: ProvisionNumberInput): Promise<ProvisionNumberResult> {
    const candidates = await this.searchNumbers(input);
    const phoneNumber = candidates.numbers[0]?.phoneNumber;

    if (!phoneNumber) {
      throw new ApiException('provider_error', 'Twilio returned no available phone numbers.', 502, {
        country: input.country,
        areaCode: input.areaCode,
      });
    }

    const body: Record<string, string> = {
      PhoneNumber: phoneNumber,
    };
    const inboundSmsUrl = input.inboundSmsUrl ?? this.config.get<string>('TWILIO_INBOUND_SMS_WEBHOOK_URL');
    const statusCallbackUrl = input.statusCallbackUrl ?? this.config.get<string>('TWILIO_NUMBER_STATUS_CALLBACK_URL');

    if (inboundSmsUrl) {
      body.SmsUrl = inboundSmsUrl;
      body.SmsMethod = input.inboundSmsMethod ?? 'POST';
    }
    if (statusCallbackUrl) {
      body.StatusCallback = statusCallbackUrl;
    }

    const response = await this.request<TwilioIncomingNumber>('POST', '/IncomingPhoneNumbers.json', body);

    return {
      provider: 'twilio',
      providerNumberId: response.sid,
      phoneNumber: response.phone_number,
      country: response.iso_country ?? input.country,
      areaCode: input.areaCode,
      capabilities: this.normalizeCapabilities(response.capabilities, input.capabilities),
    };
  }

  async releaseNumber(input: ReleaseNumberInput): Promise<ReleaseNumberResult> {
    await this.request<Record<string, never>>('DELETE', `/IncomingPhoneNumbers/${input.providerNumberId}.json`);
    return { released: true };
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const body: Record<string, string> = {
      From: input.from,
      To: input.to,
      Body: input.body,
    };
    const statusCallbackUrl = input.statusCallbackUrl ?? this.config.get<string>('TWILIO_MESSAGE_STATUS_CALLBACK_URL');
    if (statusCallbackUrl) {
      body.StatusCallback = statusCallbackUrl;
    }

    const response = await this.request<TwilioMessage>('POST', '/Messages.json', body);

    return {
      provider: 'twilio',
      providerMessageId: response.sid,
      status: this.normalizeMessageStatus(response.status),
    };
  }

  async createCall(input: CreateCallInput): Promise<CreateCallResult> {
    const response = await this.request<TwilioCall>('POST', '/Calls.json', {
      From: input.from,
      To: input.to,
      Url: this.config.get<string>('TWILIO_VOICE_WEBHOOK_URL', 'https://example.com/agentline/twiml'),
    });

    return {
      provider: 'twilio',
      providerCallId: response.sid,
      status: this.normalizeCallStatus(response.status),
      durationSeconds: Number.parseInt(response.duration ?? '0', 10) || 0,
    };
  }

  async endCall(input: EndCallInput): Promise<EndCallResult> {
    const response = await this.request<TwilioCall>('POST', `/Calls/${input.providerCallId}.json`, {
      Status: 'completed',
    });

    return { status: response.status === 'canceled' ? 'canceled' : 'completed' };
  }

  async transferCall(input: TransferCallInput): Promise<TransferCallResult> {
    await this.request<TwilioCall>('POST', `/Calls/${input.providerCallId}.json`, {
      Twiml: `<Response><Dial>${input.to}</Dial></Response>`,
    });

    return { status: 'transferred' };
  }

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, string>) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      throw new ApiException('provider_error', 'Twilio credentials are not configured.', 500);
    }

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body ? new URLSearchParams(body) : undefined,
    });

    if (response.status === 204) {
      return {} as T;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new ApiException('provider_error', 'Twilio API request failed.', 502, {
        status: response.status,
        code: payload.code,
        message: payload.message,
      });
    }

    return payload as T;
  }

  private normalizeCapabilities(
    capabilities?: TwilioAvailableNumber['capabilities'],
    fallback: Array<'sms' | 'mms' | 'voice'> = ['sms', 'voice'],
  ) {
    if (!capabilities) {
      return fallback;
    }

    return [
      capabilities.SMS ? 'sms' : null,
      capabilities.MMS ? 'mms' : null,
      capabilities.voice ? 'voice' : null,
    ].filter((capability): capability is 'sms' | 'mms' | 'voice' => Boolean(capability));
  }

  private normalizeMessageStatus(status: string): 'sent' | 'delivered' | 'failed' {
    if (status === 'delivered') {
      return 'delivered';
    }
    if (['failed', 'undelivered'].includes(status)) {
      return 'failed';
    }
    return 'sent';
  }

  private normalizeCallStatus(status: string): CreateCallResult['status'] {
    if (status === 'busy') {
      return 'busy';
    }
    if (status === 'no-answer') {
      return 'no_answer';
    }
    if (['failed', 'canceled'].includes(status)) {
      return 'failed';
    }
    return 'completed';
  }
}
