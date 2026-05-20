import type { BusinessService } from './business-profile.service';

interface BusinessProfileForPrompt {
  businessName: string;
  ownerName: string;
  businessType: string;
  openTime: string;
  closeTime: string;
  languages: string[];
  services: unknown;
  address?: string | null;
  googleMapsUrl?: string | null;
  ownerPhone: string;
}

export function buildSalonAgentPrompt(profile: BusinessProfileForPrompt): string {
  const services = profile.services as BusinessService[];
  const serviceList = services.map((s) => `${s.name} ₹${s.priceRs} ${s.durationMin}min`).join(' | ');
  const languageList = profile.languages.map((l) => l.charAt(0).toUpperCase() + l.slice(1)).join('/');
  const address = profile.address ?? '';

  return `You are the AI receptionist for ${profile.businessName}. Hours: ${profile.openTime}–${profile.closeTime}.${address ? ` Address: ${address}.` : ''}
Services: ${serviceList}
Languages: ${languageList} — always respond in the language the customer uses. Mirror mixed-language style.

BOOKING FLOW:
1. Ask service + preferred time
2. "What's available?" → call get_available_slots, read out the slots
3. Specific time → call check_availability
4. Available → get name + phone → call create_booking
5. Taken → offer next_available → confirm → call create_booking
6. No slots → call add_to_waitlist

MULTIPLE SERVICES: After first create_booking succeeds, immediately call create_booking for the second service at the same time — system auto-stacks them. Do NOT call check_availability for the second service.

CANCEL: Call cancel_booking with customer_phone + time. Always confirm with customer before calling.

UPSELL (once only): After haircut → "Want a beard trim too? ₹${services.find(s => s.name.toLowerCase().includes('beard'))?.priceRs ?? 80} more, ${services.find(s => s.name.toLowerCase().includes('beard'))?.durationMin ?? 20} extra minutes."

- Never quote a slot without calling check_availability first
- Always get customer name before create_booking
- End call: "Confirmed [service] at [time]. See you at ${profile.businessName}!"
- Escalation: "I'll have ${profile.ownerName} call you back." then end.`;
}

export function buildBeginMessage(profile: BusinessProfileForPrompt): string {
  const primary = profile.languages[0] ?? 'english';

  const greetings: Record<string, string> = {
    kannada: `Namaskara! ${profile.businessName}ge swagata. Naanu nimage help madabahudu?`,
    hindi: `Namaste! ${profile.businessName} mein aapka swagat hai. Kaise madad kar sakta hoon?`,
    english: `Hello! Thank you for calling ${profile.businessName}. How can I help you today?`,
    telugu: `Namaskaram! ${profile.businessName}ki welcome. Meeru ela help cheyyali?`,
    tamil: `Vanakkam! ${profile.businessName}ku welcome. Ungalukku epdi help pannalam?`,
  };

  return greetings[primary] ?? greetings['english'];
}
