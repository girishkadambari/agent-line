import { Injectable } from '@nestjs/common';

import type {
  CreateCallResult,
  CreateCallInput,
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
  TransferCallResult,
  TransferCallInput,
} from '../../../domain/provider';

@Injectable()
export class MockProviderService implements TelecomProvider {
  async searchNumbers(input: SearchNumbersInput): Promise<SearchNumbersResult> {
    return {
      numbers: Array.from({ length: 5 }, (_, index) => ({
        phoneNumber: this.mockPhoneNumber(input.country, input.areaCode, index),
        country: input.country,
        areaCode: input.areaCode,
        capabilities: input.capabilities,
      })),
    };
  }

  async provisionNumber(input: ProvisionNumberInput): Promise<ProvisionNumberResult> {
    return {
      provider: 'mock',
      providerNumberId: `mock_num_${input.projectId}_${input.areaCode ?? '000'}`,
      phoneNumber: this.mockPhoneNumber(input.country, input.areaCode, 0),
      country: input.country,
      areaCode: input.areaCode,
      capabilities: input.capabilities,
    };
  }

  async releaseNumber(input: ReleaseNumberInput): Promise<ReleaseNumberResult> {
    void input;
    return { released: true };
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    void input;
    return {
      provider: 'mock',
      providerMessageId: `mock_msg_${Date.now()}`,
      status: 'delivered',
    };
  }

  async createCall(input: CreateCallInput): Promise<CreateCallResult> {
    void input;
    return {
      provider: 'mock',
      providerCallId: `mock_call_${Date.now()}`,
      status: 'completed',
      durationSeconds: 64,
    };
  }

  async endCall(input: EndCallInput): Promise<EndCallResult> {
    void input;
    return { status: 'completed' };
  }

  async transferCall(input: TransferCallInput): Promise<TransferCallResult> {
    void input;
    return { status: 'transferred' };
  }

  private mockPhoneNumber(country: string, areaCode = '415', index: number) {
    if (country !== 'US' && country !== 'CA') {
      return `+1999${areaCode}${String(index).padStart(4, '0')}`;
    }

    return `+1${areaCode}555${String(1000 + index)}`;
  }
}
