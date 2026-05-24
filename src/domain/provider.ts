export type ProviderCapability = "sms" | "mms" | "voice";

export interface SearchNumbersInput {
  country: string;
  areaCode?: string;
  capabilities: ProviderCapability[];
}

export interface AvailablePhoneNumber {
  phoneNumber: string;
  country: string;
  areaCode?: string;
  capabilities: ProviderCapability[];
  /** Monthly rental in cents (e.g. 115 = $1.15). 0 if the provider did not return pricing. */
  monthlyRentalCents: number;
}

export interface SearchNumbersResult {
  numbers: AvailablePhoneNumber[];
}

export interface ProvisionNumberInput extends SearchNumbersInput {
  workspaceId: string;
  projectId: string;
  /** Exact E.164 number to provision (from a prior search). If omitted, the provider picks one. */
  exactPhoneNumber?: string;
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
  /** Monthly rental in cents. Captured at provision time so it never goes stale. */
  monthlyRentalCents: number;
}

export interface ImportNumberInput {
  phoneNumber: string;
  capabilities: ProviderCapability[];
  inboundSmsUrl?: string;
  inboundSmsMethod?: "POST" | "GET";
  statusCallbackUrl?: string;
}

export type ImportNumberResult = ProvisionNumberResult;

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
  status: "queued" | "ringing" | "in_progress" | "completed" | "failed" | "busy" | "no_answer" | "canceled";
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
  importNumber(input: ImportNumberInput): Promise<ImportNumberResult>;
  releaseNumber(input: ReleaseNumberInput): Promise<ReleaseNumberResult>;
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
  createCall(input: CreateCallInput): Promise<CreateCallResult>;
  endCall(input: EndCallInput): Promise<EndCallResult>;
  transferCall(input: TransferCallInput): Promise<TransferCallResult>;
}
