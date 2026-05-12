import { Injectable } from '@nestjs/common';

import type {
  CreateCallResult,
  CreateCallInput,
  EndCallInput,
  EndCallResult,
  ImportNumberInput,
  ImportNumberResult,
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
    const uniqueSuffix = this.uniqueSuffix();

    return {
      provider: 'mock',
      providerNumberId: `mock_num_${input.projectId}_${input.areaCode ?? '000'}_${uniqueSuffix}`,
      phoneNumber: this.mockPhoneNumber(input.country, input.areaCode, Number(uniqueSuffix.slice(-4))),
      country: input.country,
      areaCode: input.areaCode,
      capabilities: input.capabilities,
    };
  }

  async importNumber(input: ImportNumberInput): Promise<ImportNumberResult> {
    return {
      provider: 'mock',
      providerNumberId: `mock_import_${input.phoneNumber.replace(/\D/g, '')}`,
      phoneNumber: input.phoneNumber,
      country: 'US',
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
    const lineNumber = String(1000 + (index % 9000)).padStart(4, '0');

    if (country !== 'US' && country !== 'CA') {
      return `+1999${areaCode}${lineNumber}`;
    }

    return `+1${areaCode}555${lineNumber}`;
  }

  private uniqueSuffix() {
    return `${Date.now()}${Math.floor(Math.random() * 10_000)
      .toString()
      .padStart(4, '0')}`;
  }
}
