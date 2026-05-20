import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { BusinessProfileService } from '../business/business-profile.service';
import { BusinessQueueService } from '../business/business-queue.service';
import { AppointmentService } from '../business/appointment.service';
import { SalonSchedulerService } from '../business/salon-scheduler.service';
import { InteraktService } from './interakt.service';

interface InteraktInboundMessage {
  phone_number?: string;
  country_code?: string;
  message?: {
    type?: string;
    text?: { body?: string };
  };
}

@Controller('webhooks/interakt')
export class InteraktWebhooksController {
  constructor(
    private readonly businessProfile: BusinessProfileService,
    private readonly businessQueue: BusinessQueueService,
    private readonly appointment: AppointmentService,
    private readonly scheduler: SalonSchedulerService,
    private readonly interakt: InteraktService,
  ) {}

  @Post('whatsapp')
  @HttpCode(200)
  async handleInboundMessage(@Body() body: InteraktInboundMessage) {
    const phone = body.country_code
      ? `${body.country_code}${body.phone_number}`
      : body.phone_number;

    const text = body.message?.text?.body?.trim().toLowerCase();

    if (!phone || !text) return { received: true, ignored: true };

    // 1 — Owner command
    const profile = await this.findProfileByOwnerPhone(phone);
    if (profile) {
      const command = this.businessQueue.parseCommand(text);
      const reply = await this.executeCommand(profile.id, profile.ownerPhone, command);
      if (reply) await this.interakt.sendText(phone, reply);
      return { received: true };
    }

    // 2 — Customer YES/NO confirmation or feedback score
    const handled = await this.handleCustomerReply(phone, text);
    if (handled) return { received: true };

    return { received: true, ignored: true };
  }

  private async executeCommand(
    businessProfileId: string,
    ownerPhone: string,
    command: ReturnType<BusinessQueueService['parseCommand']>,
  ): Promise<string | null> {
    switch (command.type) {
      case 'done':
        return this.businessQueue.handleDone(businessProfileId, ownerPhone);
      case 'break':
        return this.businessQueue.handleBreak(businessProfileId, command.minutes);
      case 'back':
        return this.businessQueue.handleBack(businessProfileId);
      case 'full':
        return this.businessQueue.handleFull(businessProfileId);
      case 'late':
        return this.businessQueue.handleLate(businessProfileId, command.minutes);
      case 'schedule':
        return this.businessQueue.handleSchedule(businessProfileId);
      case 'tomorrow':
        return this.businessQueue.handleTomorrow(businessProfileId);
      case 'waitlist':
        return this.businessQueue.handleWaitlist(businessProfileId);
      case 'cancel':
        return this.businessQueue.handleCancel(businessProfileId, command.reference);
      case 'walkin':
        return this.businessQueue.handleWalkin(businessProfileId, command.service);
      case 'arrived':
        return this.businessQueue.handleArrived(businessProfileId, command.name);
      case 'unknown':
        return (
          `Sorry, I didn't understand "${command.raw}".\n\n` +
          `Commands:\n` +
          `✅ *done* — finished with customer\n` +
          `☕ *break 20* — take a break\n` +
          `🔙 *back* — end break\n` +
          `🔒 *full* — no more bookings today\n` +
          `⏰ *late 10* — running late by N minutes\n` +
          `📋 *schedule* — today's appointments\n` +
          `📋 *tomorrow* — tomorrow's appointments\n` +
          `👥 *waitlist* — today's waitlist\n` +
          `❌ *cancel 4pm* — cancel appointment by time or name\n` +
          `🚶 *walkin haircut* — add walk-in customer\n` +
          `✔️ *arrived Rahul* — mark customer arrived`
        );
      default:
        return null;
    }
  }

  private async handleCustomerReply(phone: string, text: string): Promise<boolean> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const apt = await this.appointment.findUpcomingByPhone(phone, windowStart, windowEnd);

    if (!apt) {
      return this.handleFeedbackReply(phone, text);
    }

    const isYes = /^(yes|haa|ha|haan|confirm|ho|coming|barthini|barthiddene|ok|okay)$/i.test(text);
    const isNo  = /^(no|nahi|na|cancel|nope|illa|barthilla|not coming)$/i.test(text);

    if (isYes) {
      await this.appointment.confirmAppointment(apt.id);
      const time = this.appointment.formatTime(apt.scheduledAt);
      await this.interakt.sendText(
        phone,
        `✅ Great, ${apt.customerName}! See you at *${time}* at *${apt.businessProfile.businessName}*. 💈`,
      );
      await this.interakt.sendTextToOwner(
        apt.businessProfile.ownerPhone,
        `✅ *${apt.customerName}* confirmed ${apt.service} at ${time}.`,
      );
      return true;
    }

    if (isNo) {
      await this.appointment.cancelAppointment(apt.id, 'Customer cancelled via WhatsApp');
      const time = this.appointment.formatTime(apt.scheduledAt);
      await this.interakt.sendText(
        phone,
        `Okay ${apt.customerName}, your *${time}* appointment has been cancelled. Hope to see you soon! 🙏`,
      );
      await this.interakt.sendTextToOwner(
        apt.businessProfile.ownerPhone,
        `❌ *${apt.customerName}* cancelled ${apt.service} at ${time}. Checking waitlist...`,
      );
      await this.scheduler.fillFromWaitlist(apt.businessProfileId, apt.businessProfile.ownerPhone);
      return true;
    }

    return false;
  }

  private async handleFeedbackReply(phone: string, text: string): Promise<boolean> {
    const score = parseInt(text.trim(), 10);
    if (isNaN(score) || score < 1 || score > 5) return false;

    const apt = await this.appointment.findCompletedPendingFeedback(phone);
    if (!apt) return false;

    await this.appointment.saveFeedbackScore(apt.id, score);

    if (score >= 4) {
      const mapsUrl = apt.businessProfile.googleMapsUrl;
      const reviewPrompt = mapsUrl ? `\nLeave a Google review? It helps a lot! 🙏\n${mapsUrl}` : '';
      await this.interakt.sendText(
        phone,
        `Thank you ${apt.customerName}! ⭐${score} — so glad you liked it! 😊${reviewPrompt}`,
      );
    } else if (score <= 2) {
      await this.interakt.sendText(
        phone,
        `Thank you for the feedback ${apt.customerName}. We're sorry it wasn't great. We'll do better next time. 🙏`,
      );
      await this.interakt.sendTextToOwner(
        apt.businessProfile.ownerPhone,
        `⚠️ *${apt.customerName}* gave ${score}⭐ for ${apt.service}.\nConsider calling them: ${phone}`,
      );
    } else {
      await this.interakt.sendText(phone, `Thanks ${apt.customerName}! See you next time. 💈`);
    }

    return true;
  }

  private async findProfileByOwnerPhone(phone: string) {
    try {
      return await this.businessProfile.findByOwnerPhone(phone);
    } catch {
      return null;
    }
  }
}
