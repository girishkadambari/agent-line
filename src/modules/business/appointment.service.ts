import { Injectable } from '@nestjs/common';

import { createId } from '../../common/ids';
import { PrismaService } from '../prisma/prisma.service';
import { InteraktService } from '../interakt/interakt.service';
import { BusinessProfileService, type BusinessService } from './business-profile.service';

interface AvailabilityArgs {
  time: string;
  date?: string;
}

interface CreateAppointmentArgs {
  customer_name: string;
  service: string;
  time: string;
  date?: string;
  customer_phone?: string;
}

interface WaitlistArgs {
  customer_name: string;
  service?: string;
  customer_phone?: string;
}

interface WalkInArgs {
  service: string;
  priceRs: number;
  durationMin: number;
  workspaceId: string;
}

@Injectable()
export class AppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessProfile: BusinessProfileService,
    private readonly interakt: InteraktService,
  ) {}

  async checkAvailability(businessProfileId: string, args: AvailabilityArgs) {
    const profile = await this.businessProfile.getProfileById(businessProfileId);

    if (profile.isFullDay) {
      return {
        available: false,
        message: 'Fully booked today. First slot available tomorrow morning.',
        next_available: null,
      };
    }

    if (profile.isOnBreak && profile.breakResumesAt && profile.breakResumesAt > new Date()) {
      const resumeTime = this.formatTime(profile.breakResumesAt);
      return {
        available: false,
        message: `On a short break, back at ${resumeTime}. Earliest slot after that.`,
        next_available: resumeTime,
      };
    }

    const date = args.date ?? this.todayString();
    const scheduledAt = this.parseScheduledAt(date, args.time);

    const conflict = await this.findConflictingAppointment(businessProfileId, scheduledAt, 30);
    if (conflict) {
      const next = await this.findNextAvailableSlot(businessProfileId, scheduledAt, profile.closeTime);
      return {
        available: false,
        message: next
          ? `That slot is taken. Next available: ${this.formatTime(next)}`
          : 'No more slots available today.',
        next_available: next ? this.formatTime(next) : null,
      };
    }

    return {
      available: true,
      message: `${args.time} is available.`,
      next_available: null,
    };
  }

  async createAppointmentFromCall(
    businessProfileId: string,
    callId: string,
    args: CreateAppointmentArgs,
  ) {
    const profile = await this.businessProfile.getProfileById(businessProfileId);
    const services = profile.services as BusinessService[];
    const matched = this.businessProfile.findServiceByName(services, args.service);

    const date = args.date ?? this.todayString();
    let scheduledAt = this.parseScheduledAt(date, args.time);
    const priceRs = matched?.priceRs ?? 0;
    const durationMin = matched?.durationMin ?? 30;
    const customerPhone = args.customer_phone ?? '';

    // Auto-stack: if there's a conflict with the same customer at this time,
    // schedule this service right after their last service in this call
    const conflict = await this.findConflictingAppointment(businessProfileId, scheduledAt, durationMin);
    if (conflict) {
      if (conflict.customerPhone === customerPhone && customerPhone) {
        // Same customer booking a second service — stack after the first
        scheduledAt = new Date(conflict.scheduledAt.getTime() + conflict.durationMin * 60 * 1000);
      } else {
        // Different customer — real conflict, find next slot
        const next = await this.findNextAvailableSlot(businessProfileId, scheduledAt, profile.closeTime);
        if (!next) {
          return {
            success: false,
            message: 'Sorry, no available slots at that time or after. Please offer a different time.',
          };
        }
        scheduledAt = next;
      }
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        id: createId('apt'),
        workspaceId: profile.workspaceId,
        businessProfileId,
        customerName: args.customer_name,
        customerPhone,
        service: matched?.name ?? args.service,
        priceRs,
        durationMin,
        scheduledAt,
        status: 'confirmed',
        confirmedAt: new Date(),
      },
    });

    await this.interakt.sendBookingNotificationToOwner(profile, appointment);

    if (customerPhone) {
      await this.interakt.sendBookingConfirmationToCustomer(
        customerPhone,
        profile.businessName,
        args.customer_name,
        matched?.name ?? args.service,
        args.time,
        profile.address,
      );
    }

    const confirmedTime = this.formatTime(appointment.scheduledAt);
    const stackedNote = confirmedTime !== args.time ? ` (auto-scheduled at ${confirmedTime} after your previous service)` : '';

    return {
      success: true,
      appointment_id: appointment.id,
      confirmed_time: confirmedTime,
      message: `Confirmed! ${args.customer_name}, ${matched?.name ?? args.service} at ${confirmedTime}.${stackedNote}`,
      price: priceRs > 0 ? `₹${priceRs}` : null,
    };
  }

  async createWalkIn(businessProfileId: string, args: WalkInArgs) {
    const profile = await this.businessProfile.getProfileById(businessProfileId);
    const services = profile.services as BusinessService[];
    const matched = this.businessProfile.findServiceByName(services, args.service);

    const appointment = await this.prisma.appointment.create({
      data: {
        id: createId('apt'),
        workspaceId: args.workspaceId,
        businessProfileId,
        customerName: 'Walk-in',
        customerPhone: '',
        service: matched?.name ?? args.service,
        priceRs: matched?.priceRs ?? 0,
        durationMin: matched?.durationMin ?? 30,
        scheduledAt: new Date(),
        status: 'arrived',
        confirmedAt: new Date(),
        arrivedAt: new Date(),
      },
    });

    return appointment;
  }

  async getAvailableSlots(businessProfileId: string, date?: string) {
    const profile = await this.businessProfile.getProfileById(businessProfileId);
    if (profile.isFullDay) return { slots: [], message: 'Fully booked today.' };

    const d = date ?? this.todayString();
    const open = this.parseScheduledAt(d, profile.openTime);
    const close = this.parseScheduledAt(d, profile.closeTime);
    const now = new Date();

    const slots: string[] = [];
    let cursor = open < now ? new Date(Math.ceil(now.getTime() / (30 * 60000)) * 30 * 60000) : open;

    while (cursor < close) {
      const conflict = await this.findConflictingAppointment(businessProfileId, cursor, 30);
      if (!conflict) slots.push(this.formatTime(cursor));
      cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
      if (slots.length >= 8) break; // return first 8 open slots
    }

    return {
      slots,
      message: slots.length > 0 ? `Available: ${slots.join(', ')}` : 'No slots available today.',
    };
  }

  async cancelFromCall(businessProfileId: string, args: { customer_phone: string; time?: string }) {
    const appointments = await this.getTodaysAppointments(businessProfileId);
    const phone = args.customer_phone;

    let target = appointments.find((a) => {
      const phoneMatch = a.customerPhone && a.customerPhone.slice(-10) === phone.slice(-10);
      if (!phoneMatch) return false;
      if (args.time) return this.formatTime(a.scheduledAt) === args.time;
      return true;
    });

    if (!target) {
      return { success: false, message: 'No matching appointment found to cancel.' };
    }

    await this.cancelAppointment(target.id, 'Cancelled via voice call');
    return {
      success: true,
      message: `Cancelled ${target.service} at ${this.formatTime(target.scheduledAt)} for ${target.customerName}.`,
    };
  }

  async addToWaitlist(businessProfileId: string, args: WaitlistArgs) {
    const profile = await this.businessProfile.getProfileById(businessProfileId);

    await this.prisma.appointmentWaitlist.create({
      data: {
        id: createId('wl'),
        workspaceId: profile.workspaceId,
        businessProfileId,
        customerName: args.customer_name,
        customerPhone: args.customer_phone ?? '',
        service: args.service,
        date: new Date(),
        status: 'waiting',
      },
    });

    await this.interakt.sendTextToOwner(
      profile.ownerPhone,
      `👥 Waitlist: ${args.customer_name} added for today${args.service ? ` (${args.service})` : ''}.`,
    );

    return {
      success: true,
      message: `Added ${args.customer_name} to today's waitlist. We'll call when a slot opens.`,
    };
  }

  async markArrived(appointmentId: string) {
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { arrivedAt: new Date(), status: 'arrived' },
    });
  }

  async markCompleted(appointmentId: string) {
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { completedAt: new Date(), status: 'completed' },
    });
  }

  async cancelAppointment(appointmentId: string, reason?: string) {
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { cancelledAt: new Date(), status: 'cancelled', cancelReason: reason },
    });
  }

  async getTodaysAppointments(businessProfileId: string) {
    return this.prisma.appointment.findMany({
      where: {
        businessProfileId,
        scheduledAt: { gte: this.startOfToday(), lte: this.endOfToday() },
        status: { notIn: ['cancelled'] },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async getTomorrowsAppointments(businessProfileId: string) {
    return this.prisma.appointment.findMany({
      where: {
        businessProfileId,
        scheduledAt: { gte: this.startOfTomorrow(), lte: this.endOfTomorrow() },
        status: { notIn: ['cancelled'] },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async getTodaysWaitlist(businessProfileId: string) {
    return this.prisma.appointmentWaitlist.findMany({
      where: {
        businessProfileId,
        date: { gte: this.startOfToday(), lte: this.endOfToday() },
        status: 'waiting',
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findNextAppointmentAfter(businessProfileId: string, after: Date) {
    return this.prisma.appointment.findFirst({
      where: {
        businessProfileId,
        scheduledAt: { gt: after },
        status: { notIn: ['cancelled'] },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findTodaysAppointmentByName(businessProfileId: string, name: string) {
    const appointments = await this.getTodaysAppointments(businessProfileId);
    const normalized = name.toLowerCase().trim();
    return appointments.find((a) => a.customerName.toLowerCase().includes(normalized)) ?? null;
  }

  async findTodaysAppointmentByTime(businessProfileId: string, timeStr: string) {
    const appointments = await this.getTodaysAppointments(businessProfileId);
    return appointments.find((a) => this.formatTime(a.scheduledAt) === timeStr) ?? null;
  }

  async findUpcomingByPhone(phone: string, windowStart: Date, windowEnd: Date) {
    return this.prisma.appointment.findFirst({
      where: {
        customerPhone: { endsWith: phone.slice(-10) },
        scheduledAt: { gte: windowStart, lte: windowEnd },
        status: { in: ['confirmed', 'pending'] },
      },
      include: { businessProfile: true },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async confirmAppointment(id: string) {
    return this.prisma.appointment.update({
      where: { id },
      data: { confirmedAt: new Date(), status: 'confirmed' },
    });
  }

  async findCompletedPendingFeedback(phone: string) {
    return this.prisma.appointment.findFirst({
      where: {
        customerPhone: { endsWith: phone.slice(-10) },
        status: 'completed',
        feedbackScore: null,
        feedbackSentAt: { not: null },
      },
      include: { businessProfile: true },
      orderBy: { completedAt: 'desc' },
    });
  }

  async saveFeedbackScore(id: string, score: number) {
    return this.prisma.appointment.update({
      where: { id },
      data: { feedbackScore: score },
    });
  }

  private async findConflictingAppointment(
    businessProfileId: string,
    scheduledAt: Date,
    durationMin: number,
  ) {
    const end = new Date(scheduledAt.getTime() + durationMin * 60 * 1000);
    return this.prisma.appointment.findFirst({
      where: {
        businessProfileId,
        status: { notIn: ['cancelled'] },
        scheduledAt: { lt: end },
        AND: {
          scheduledAt: {
            gte: new Date(scheduledAt.getTime() - durationMin * 60 * 1000),
          },
        },
      },
    });
  }

  private async findNextAvailableSlot(
    businessProfileId: string,
    after: Date,
    closeTime: string,
  ): Promise<Date | null> {
    const closeAt = this.parseScheduledAt(this.todayString(), closeTime);
    let candidate = new Date(after.getTime() + 30 * 60 * 1000);

    while (candidate < closeAt) {
      const conflict = await this.findConflictingAppointment(businessProfileId, candidate, 30);
      if (!conflict) return candidate;
      candidate = new Date(candidate.getTime() + 30 * 60 * 1000);
    }

    return null;
  }

  private parseScheduledAt(date: string, time: string): Date {
    return new Date(`${date}T${time.padStart(5, '0')}:00`);
  }

  private todayString(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfToday(): Date {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private startOfTomorrow(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfTomorrow(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  formatTime(date: Date): string {
    return date.toTimeString().slice(0, 5);
  }
}
