import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Appointment, BusinessProfile } from '@prisma/client';

import { ApiException } from '../../common/errors/api.exception';

@Injectable()
export class InteraktService {
  private readonly baseUrl = 'https://api.interakt.ai/v1/public/message';

  constructor(private readonly config: ConfigService) {}

  async sendBookingNotificationToOwner(profile: BusinessProfile, booking: Appointment) {
    const time = booking.scheduledAt.toTimeString().slice(0, 5);
    const price = booking.priceRs > 0 ? ` — ₹${booking.priceRs}` : '';

    const message =
      `📅 *New Booking*\n` +
      `👤 ${booking.customerName}\n` +
      `✂️ ${booking.service}${price}\n` +
      `🕐 ${time}\n` +
      (booking.customerPhone ? `📞 ${booking.customerPhone}` : '');

    await this.sendText(profile.ownerPhone, message);
  }

  async sendBookingConfirmationToCustomer(
    customerPhone: string,
    salonName: string,
    customerName: string,
    service: string,
    time: string,
    address?: string | null,
  ) {
    const lines = [
      `💈 *${salonName} — Booking Confirmed!*`,
      ``,
      `Hi ${customerName} ✅`,
      `Service: ${service}`,
      `Time: ${time}`,
    ];
    if (address) lines.push(`📍 ${address}`);
    lines.push(``, `See you soon! 😊`);

    await this.sendText(customerPhone, lines.join('\n'));
  }

  async sendTextToOwner(ownerPhone: string, message: string) {
    await this.sendText(ownerPhone, message);
  }

  async sendText(to: string, message: string) {
    const apiKey = this.config.get<string>('INTERAKT_API_KEY');
    if (!apiKey) return; // WhatsApp silently disabled when key not configured

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        countryCode: this.extractCountryCode(to),
        phoneNumber: this.extractLocalNumber(to),
        type: 'Text',
        data: { message },
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as Record<string, unknown>;
      throw new ApiException('provider_error', 'Interakt message send failed.', 502, {
        status: response.status,
        error: payload.error ?? payload.message,
        to,
      });
    }
  }

  private extractCountryCode(phone: string): string {
    if (phone.startsWith('+91')) return '+91';
    if (phone.startsWith('+1')) return '+1';
    if (phone.startsWith('+')) return phone.slice(0, 3);
    return '+91';
  }

  private extractLocalNumber(phone: string): string {
    return phone.replace(/^\+\d{1,3}/, '').replace(/\D/g, '');
  }
}
