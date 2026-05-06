export const USAGE_PRICING_CENTS = {
  phoneNumberProvision: 100,
  outboundSms: 1,
  inboundSms: 1,
  voiceMinute: 3,
} as const;

export function centsToUsdDecimal(cents: number) {
  return (cents / 100).toFixed(4);
}

export function secondsToBillableMinutes(seconds: number) {
  return Math.max(1, Math.ceil(seconds / 60));
}
