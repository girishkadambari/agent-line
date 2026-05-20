import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { InteraktService } from '../interakt/interakt.service';
import { BusinessProfileService } from './business-profile.service';
import { AppointmentService } from './appointment.service';

@Injectable()
export class SalonSchedulerService {
  private readonly logger = new Logger(SalonSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly interakt: InteraktService,
    private readonly businessProfile: BusinessProfileService,
    private readonly appointment: AppointmentService,
  ) {}

  // ─── 8:45am daily — Morning briefing to every salon owner ────────────────

  @Cron('0 45 8 * * *', { timeZone: 'Asia/Kolkata' })
  async sendMorningBriefings() {
    this.logger.log('Running morning briefings');
    const profiles = await this.prisma.businessProfile.findMany();

    for (const profile of profiles) {
      try {
        const appointments = await this.appointment.getTodaysAppointments(profile.id);
        const waitlist = await this.appointment.getTodaysWaitlist(profile.id);

        if (appointments.length === 0) {
          await this.interakt.sendTextToOwner(
            profile.ownerPhone,
            `☀️ Good morning! No bookings yet today.\nReply *schedule* anytime to check.`,
          );
          continue;
        }

        const lines: string[] = [`☀️ *Good morning, ${profile.ownerName}!*\n`];
        lines.push(`📅 *Today's schedule:*`);

        for (const apt of appointments) {
          const time = this.appointment.formatTime(apt.scheduledAt);
          lines.push(`${time} → ${apt.customerName} (${apt.service})`);
        }

        const freeSlots = this.countFreeSlots(appointments, profile.openTime, profile.closeTime);
        lines.push(`\n✅ *${appointments.length} booked* · ${freeSlots} free slots`);

        if (waitlist.length > 0) {
          lines.push(`👥 Waitlist: ${waitlist.length} waiting`);
        }

        lines.push(`\nReply *full* to stop new bookings today.`);

        await this.interakt.sendTextToOwner(profile.ownerPhone, lines.join('\n'));
      } catch (err) {
        this.logger.error(`Morning briefing failed for ${profile.id}: ${String(err)}`);
      }
    }
  }

  // ─── 6pm daily — Day-before confirmation requests ────────────────────────

  @Cron('0 0 18 * * *', { timeZone: 'Asia/Kolkata' })
  async sendDayBeforeConfirmations() {
    this.logger.log('Sending day-before confirmations');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(tomorrow);
    start.setHours(0, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(23, 59, 59, 999);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        scheduledAt: { gte: start, lte: end },
        status: { in: ['confirmed', 'pending'] },
        confirmationSentAt: null,
        customerPhone: { not: '' },
      },
      include: { businessProfile: true },
    });

    for (const apt of appointments) {
      try {
        const time = this.appointment.formatTime(apt.scheduledAt);
        const message =
          `Hi ${apt.customerName}! 👋\n\n` +
          `📅 Reminder: *${apt.businessProfile.businessName}*\n` +
          `✂️ ${apt.service} tomorrow at *${time}*\n\n` +
          `Reply *YES* to confirm or *NO* to cancel.`;

        await this.interakt.sendText(apt.customerPhone, message);
        await this.prisma.appointment.update({
          where: { id: apt.id },
          data: { confirmationSentAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Day-before confirmation failed for ${apt.id}: ${String(err)}`);
      }
    }
  }

  // ─── Every 5 min — 2hr same-day reminder ─────────────────────────────────

  @Cron('*/5 * * * *')
  async sendSameDayReminders() {
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const twoHoursPlusFive = new Date(twoHoursFromNow.getTime() + 5 * 60 * 1000);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        scheduledAt: { gte: twoHoursFromNow, lte: twoHoursPlusFive },
        status: { in: ['confirmed', 'pending'] },
        reminderSent: false,
        customerPhone: { not: '' },
      },
      include: { businessProfile: true },
    });

    for (const apt of appointments) {
      try {
        const time = this.appointment.formatTime(apt.scheduledAt);
        const message =
          `Hey ${apt.customerName}! 👋\n\n` +
          `Your *${apt.service}* appointment at *${apt.businessProfile.businessName}* ` +
          `is in *2 hours* (${time}).\n\n` +
          `Still coming? Reply *YES* or *NO*`;

        await this.interakt.sendText(apt.customerPhone, message);
        await this.prisma.appointment.update({
          where: { id: apt.id },
          data: { reminderSent: true },
        });
      } catch (err) {
        this.logger.error(`Same-day reminder failed for ${apt.id}: ${String(err)}`);
      }
    }
  }

  // ─── Every 5 min — No-show detection ─────────────────────────────────────

  @Cron('*/5 * * * *')
  async detectNoShows() {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const overdue = await this.prisma.appointment.findMany({
      where: {
        scheduledAt: { lte: fifteenMinutesAgo },
        status: 'confirmed',
      },
      include: { businessProfile: true },
    });

    for (const apt of overdue) {
      try {
        const time = this.appointment.formatTime(apt.scheduledAt);

        // Alert owner
        await this.interakt.sendTextToOwner(
          apt.businessProfile.ownerPhone,
          `⚠️ *${apt.customerName}* (${time} ${apt.service}) hasn't arrived yet.\n` +
          `Reply *arrived ${apt.customerName}* if they came, or it'll be marked no-show in 15 min.`,
        );

        // Nudge customer
        if (apt.customerPhone) {
          await this.interakt.sendText(
            apt.customerPhone,
            `Hi ${apt.customerName}! 👋 ${apt.businessProfile.businessName} is waiting for you.\n` +
            `On your way? Reply *YES* or *NO*`,
          );
        }

        // Mark no-show after another 15 min check would re-trigger — prevent by marking pending
        await this.prisma.appointment.update({
          where: { id: apt.id },
          data: { status: 'no_show' },
        });

        // Check waitlist
        await this.fillFromWaitlist(apt.businessProfileId, apt.businessProfile.ownerPhone);
      } catch (err) {
        this.logger.error(`No-show detection failed for ${apt.id}: ${String(err)}`);
      }
    }
  }

  // ─── 10pm daily — End of day summary ─────────────────────────────────────

  @Cron('0 0 22 * * *', { timeZone: 'Asia/Kolkata' })
  async sendEndOfDaySummaries() {
    this.logger.log('Sending end of day summaries');
    const profiles = await this.prisma.businessProfile.findMany();

    for (const profile of profiles) {
      try {
        const appointments = await this.appointment.getTodaysAppointments(profile.id);
        const completed = appointments.filter((a) => a.status === 'completed');
        const noShows = appointments.filter((a) => a.status === 'no_show');
        const revenue = completed.reduce((sum, a) => sum + a.priceRs, 0);

        const tomorrow = await this.appointment.getTomorrowsAppointments(profile.id);

        const lines: string[] = [
          `🌙 *Day done, ${profile.ownerName}!*\n`,
          `✅ Served: ${completed.length} customers`,
          `❌ No-shows: ${noShows.length}`,
          `💰 Revenue today: ₹${revenue.toLocaleString()}`,
        ];

        if (tomorrow.length > 0) {
          lines.push(`\n📅 *Tomorrow: ${tomorrow.length} already booked*`);
          const first = tomorrow[0];
          if (first) {
            lines.push(`First: ${first.customerName} at ${this.appointment.formatTime(first.scheduledAt)}`);
          }
        } else {
          lines.push(`\n📅 Tomorrow: No bookings yet`);
        }

        lines.push(`\nGood night! 💈`);

        await this.interakt.sendTextToOwner(profile.ownerPhone, lines.join('\n'));

        // Reset full-day flag for tomorrow
        if (profile.isFullDay) {
          await this.prisma.businessProfile.update({
            where: { id: profile.id },
            data: { isFullDay: false },
          });
        }
      } catch (err) {
        this.logger.error(`End of day summary failed for ${profile.id}: ${String(err)}`);
      }
    }
  }

  // ─── 10am daily — Re-engagement for lapsed customers (28 days) ───────────

  @Cron('0 0 10 * * *', { timeZone: 'Asia/Kolkata' })
  async reEngageLapsedCustomers() {
    this.logger.log('Running re-engagement check');

    const twentyEightDaysAgo = new Date();
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

    const profiles = await this.prisma.businessProfile.findMany();

    for (const profile of profiles) {
      try {
        // Find customers who visited between 28-35 days ago (to avoid repeat messages)
        const thirtyFiveDaysAgo = new Date();
        thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

        const lapsed = await this.prisma.appointment.findMany({
          where: {
            businessProfileId: profile.id,
            status: 'completed',
            completedAt: { gte: thirtyFiveDaysAgo, lte: twentyEightDaysAgo },
            customerPhone: { not: '' },
          },
          distinct: ['customerPhone'],
        });

        for (const apt of lapsed.slice(0, 10)) { // max 10 per day
          await this.interakt.sendText(
            apt.customerPhone,
            `Hey ${apt.customerName}! 👋\n\n` +
            `It's been a while since your last visit at *${profile.businessName}*.\n` +
            `Slots are open this week — want to book?\n\n` +
            `Reply *YES* and we'll arrange it! 💈`,
          );
        }
      } catch (err) {
        this.logger.error(`Re-engagement failed for ${profile.id}: ${String(err)}`);
      }
    }
  }

  // ─── 2hrs after completion — Feedback request ────────────────────────────

  @Cron('*/10 * * * *')
  async sendFeedbackRequests() {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twoHoursTenAgo = new Date(now.getTime() - (2 * 60 + 10) * 60 * 1000);

    const completed = await this.prisma.appointment.findMany({
      where: {
        status: 'completed',
        completedAt: { gte: twoHoursTenAgo, lte: twoHoursAgo },
        feedbackScore: null,
        feedbackSentAt: null,
        customerPhone: { not: '' },
      },
      include: { businessProfile: true },
    });

    for (const apt of completed) {
      try {
        await this.interakt.sendText(
          apt.customerPhone,
          `${apt.customerName}, thanks for visiting *${apt.businessProfile.businessName}* today! 🙏\n\n` +
          `How was your experience?\n` +
          `Reply: *1* 😞 *2* 😐 *3* 🙂 *4* 😊 *5* 🤩`,
        );

        await this.prisma.appointment.update({
          where: { id: apt.id },
          data: { feedbackSentAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Feedback request failed for ${apt.id}: ${String(err)}`);
      }
    }
  }

  // ─── Helper — fill slot from waitlist ────────────────────────────────────

  async fillFromWaitlist(businessProfileId: string, ownerPhone: string) {
    const [next, profile] = await Promise.all([
      this.prisma.appointmentWaitlist.findFirst({
        where: { businessProfileId, status: 'waiting' },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.businessProfile.findUnique({ where: { id: businessProfileId } }),
    ]);

    if (!next || !profile) return;

    await this.prisma.appointmentWaitlist.update({
      where: { id: next.id },
      data: { status: 'offered', notifiedAt: new Date() },
    });

    if (next.customerPhone) {
      await this.interakt.sendText(
        next.customerPhone,
        `Hi ${next.customerName}! 🎉\n` +
        `A slot just opened at *${profile.businessName}*.\n` +
        `Can you come now? Reply *YES* to confirm or *NO* to skip.`,
      );
    }

    await this.interakt.sendTextToOwner(
      ownerPhone,
      `📢 Slot opened — calling *${next.customerName}* from waitlist (${next.customerPhone}).`,
    );
  }

  // ─── Helper — count free 30-min slots in a day ───────────────────────────

  private countFreeSlots(
    appointments: { scheduledAt: Date; durationMin: number }[],
    openTime: string,
    closeTime: string,
  ): number {
    const today = new Date().toISOString().slice(0, 10);
    const openDate = new Date(`${today}T${openTime}:00`);
    const closeDate = new Date(`${today}T${closeTime}:00`);
    const totalMinutes = (closeDate.getTime() - openDate.getTime()) / 60000;
    const bookedMinutes = appointments.reduce((sum, a) => sum + a.durationMin, 0);
    return Math.max(0, Math.floor((totalMinutes - bookedMinutes) / 30));
  }
}
