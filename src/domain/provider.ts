export type ProviderCapability = "sms" | "mms" | "voice";

export interface SearchNumbersInput {
  country: string;
  areaCode?: string;
  capabilities: ProviderCapability[];
}

export interface SearchNumbersResult {
  numbers: Array<{
    phoneNumber: string;
    country: string;
    areaCode?: string;
    capabilities: ProviderCapability[];
  }>;
}

export interface ProvisionNumberInput extends SearchNumbersInput {
  workspaceId: string;
  projectId: string;
  inboundSmsUrl?: string;
  inboundSmsMethod?: "POST" | "GET";
  statusCallbackUrl?: string;
}

export interface ProvisionNumberResult {
  provider: "mock" | "twilio" | "telnyx";
  providerNumberId: string;
  phoneNumber: string;
  country: string;
  areaCode?: string;
  capabilities: ProviderCapability[];
}

export interface ReleaseNumberInput {
  providerNumberId: string;
}

export interface ReleaseNumberResult {
  released: boolean;
}

export interface SendSmsInput {
  from: string;
  to: string;
  body: string;
  statusCallbackUrl?: string;
}

export interface SendSmsResult {
  provider: "mock" | "twilio" | "telnyx";
  providerMessageId: string;
  status: "sent" | "delivered" | "failed";
}

export interface CreateCallInput {
  from: string;
  to: string;
}

export interface CreateCallResult {
  provider: "mock" | "twilio" | "telnyx";
  providerCallId: string;
  status: "completed" | "failed" | "busy" | "no_answer";
  durationSeconds: number;
}

export interface EndCallInput {
  providerCallId: string;
}

export interface EndCallResult {
  status: "completed" | "canceled";
}

export interface TransferCallInput {
  providerCallId: string;
  to: string;
}

export interface TransferCallResult {
  status: "transferred";
}

export interface TelecomProvider {
  searchNumbers(input: SearchNumbersInput): Promise<SearchNumbersResult>;
  provisionNumber(input: ProvisionNumberInput): Promise<ProvisionNumberResult>;
  releaseNumber(input: ReleaseNumberInput): Promise<ReleaseNumberResult>;
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
  createCall(input: CreateCallInput): Promise<CreateCallResult>;
  endCall(input: EndCallInput): Promise<EndCallResult>;
  transferCall(input: TransferCallInput): Promise<TransferCallResult>;
}
