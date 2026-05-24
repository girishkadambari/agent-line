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
  // Kept for backward compatibility with pre-existing usage events.
  {
    key: 'voice_minute',
    resourceType: 'call',
    channel: 'voice',
    unit: 'minute',
    unitCostCents: 3,
    formula: 'ceil(duration_seconds / 60) * voice_minute',
  },
  // Direction-aware rate keys — used for all new calls.
  // Inbound and outbound share the same rate today but are tracked separately
  // so per-direction pricing can be introduced without a data migration.
  {
    key: 'voice_inbound_minute',
    resourceType: 'call',
    channel: 'voice.inbound',
    unit: 'minute',
    unitCostCents: 3,
    formula: 'ceil(duration_seconds / 60) * voice_inbound_minute',
  },
  {
    key: 'voice_outbound_minute',
    resourceType: 'call',
    channel: 'voice.outbound',
    unit: 'minute',
    unitCostCents: 3,
    formula: 'ceil(duration_seconds / 60) * voice_outbound_minute',
  },
  // ── Per-turn component costs (hosted mode) ──────────────────────────────────
  // These capture the cost of each AI turn so the dashboard can show a breakdown.
  // Rate basis: Claude Haiku ≈ $0.0008/1K input + $0.004/1K output tokens.
  // Typical turn ≈ 150 input + 50 output tokens → ~0.032 cents.  Rounded to 0.05c.
  {
    key: 'ai_llm_turn',
    resourceType: 'call',
    channel: 'voice.ai.llm',
    unit: 'turn',
    unitCostCents: 0.05,
    formula: 'turns * ai_llm_turn',
  },
  // Sarvam STT: estimated at $0.006/minute ($0.0001/second).
  {
    key: 'ai_stt_second',
    resourceType: 'call',
    channel: 'voice.ai.stt',
    unit: 'second',
    unitCostCents: 0.01,
    formula: 'speech_seconds * ai_stt_second',
  },
  // Sarvam TTS: estimated at $0.000015/character.
  {
    key: 'ai_tts_character',
    resourceType: 'call',
    channel: 'voice.ai.tts',
    unit: 'character',
    unitCostCents: 0.0015,
    formula: 'characters * ai_tts_character',
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
