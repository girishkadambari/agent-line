export const USAGE_PRICING_VERSION = '2026-05-17';

export const DEFAULT_USAGE_RATES = [
  {
    key: 'phone_number_provision',
    resourceType: 'phone_number',
    channel: 'number',
    unit: 'number',
    unitCostCents: 100,
    formula: 'quantity * phone_number_provision',
  },
  {
    key: 'sms_outbound',
    resourceType: 'message',
    channel: 'sms.outbound',
    unit: 'message',
    unitCostCents: 1,
    formula: 'outbound_messages * sms_outbound',
  },
  {
    key: 'sms_inbound',
    resourceType: 'message',
    channel: 'sms.inbound',
    unit: 'message',
    unitCostCents: 1,
    formula: 'inbound_messages * sms_inbound',
  },
  {
    key: 'voice_minute',
    resourceType: 'call',
    channel: 'voice',
    unit: 'minute',
    unitCostCents: 3,
    formula: 'ceil(duration_seconds / 60) * voice_minute',
  },
] as const;

export type UsageRateKey = (typeof DEFAULT_USAGE_RATES)[number]['key'];

export const USAGE_PRICING_CENTS = {
  phoneNumberProvision: getDefaultUsageRate('phone_number_provision').unitCostCents,
  outboundSms: getDefaultUsageRate('sms_outbound').unitCostCents,
  inboundSms: getDefaultUsageRate('sms_inbound').unitCostCents,
  voiceMinute: getDefaultUsageRate('voice_minute').unitCostCents,
} as const;

export function getDefaultUsageRate(key: UsageRateKey) {
  return DEFAULT_USAGE_RATES.find((rate) => rate.key === key)!;
}

export function centsToUsdDecimal(cents: number) {
  return (cents / 100).toFixed(4);
}

export function secondsToBillableMinutes(seconds: number) {
  return Math.max(1, Math.ceil(seconds / 60));
}
