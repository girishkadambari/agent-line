import { Injectable } from '@nestjs/common';

import { InteraktService } from '../interakt/interakt.service';
import { AppointmentService } from './appointment.service';
import { BusinessProfileService } from './business-profile.service';

export type OwnerCommand =
  | { type: 'done' }
  | { type: 'break'; minutes: number }
  | { type: 'back' }
  | { type: 'full' }
  | { type: 'late'; minutes: number }
  | { type: 'schedule' }
  | { type: 'tomorrow' }
  | { type: 'waitlist' }
  | { type: 'cancel'; reference: string }
  | { type: 'walkin'; service: string }
  | { type: 'arrived'; name: string }
  | { type: 'unknown'; raw: string };

@Injectable()
export class BusinessQueueService {
  constructor(
    private readonly businessProfile: BusinessProfileService,
    private readonly appointment: AppointmentService,
    private readonly interakt: InteraktService,
  ) {}

  parseCommand(text: string): OwnerCommand {
    const raw = text.trim().toLowerCase();

    if (raw === 'done') return { type: 'done' };
    if (raw === 'back') return { type: 'back' };
    if (raw === 'full') return { type: 'full' };
    if (raw === 'schedule') return { type: 'schedule' };
    if (raw === 'tomorrow') return { type: 'tomorrow' };
    if (raw === 'waitlist') return { type: 'waitlist' };

    const breakMatch = raw.match(/^break\s*(\d+)?$/);
    if (breakMatch) {
      return { type: 'break', minutes: Number.parseInt(breakMatch[1] ?? '15', 10) };
    }

    const lateMatch = raw.match(/^late\s+(\d+)$/);
    if (lateMatch) {
      return { type: 'late', minutes: Number.parseInt(lateMatch[1], 10) };
    }

    const cancelMatch = raw.match(/^cancel\s+(.+)$/);
    if (cancelMatch) {
      return { type: 'cancel', reference: cancelMatch[1].trim() };
    }

    const walkinMatch = raw.match(/^walkin\s+(.+)$/);
    if (walkinMatch) {
      return { type: 'walkin', service: walkinMatch[1].trim() };
    }

    const arrivedMatch = raw.match(/^(?:here|arrived)\s+(.+)$/);
    if (arrivedMatch) {
      return { type: 'arrived', name: arrivedMatch[1].trim() };
    }

    return { type: 'unknown', raw: text };
  }

  async handleDone(businessProfileId: string, ownerPhone: string): Promise<string> {
    const nextAppointment = await this.appointment.findNextAppointmentAfter(businessProfileId, new Date());
    const waitlist = await this.appointment.getTodaysWaitlist(businessProfileId);

    if (!nextAppointment) {
      if (waitlist.length > 0) {
        const first = waitlist[0];
        return `✅ Slot free now.\n👥 Waitlist: ${first.customerName} waiting.\nCall: ${first.customerPhone}`;
      }
      return `✅ No more appointments today. You're done!`;
    }

    const minutesUntilNext = Math.round(
      (nextAppointment.scheduledAt.getTime() - Date.now()) / 60000,
    );

    if (minutesUntilNext > 20 && waitlist.length > 0) {
      const first = waitlist[0];
      return (
        `✅ Slot free (~${minutesUntilNext} min gap).\n` +
        `📞 Call ${first.customerName} from waitlist: ${first.customerPhone}\n` +
        `Next booked: ${nextAppointment.customerName} at ${this.appointment.formatTime(nextAppointment.scheduledAt)}`
      );
    }

    return `✅ ${nextAppointment.customerName} next at ${this.appointment.formatTime(nextAppointment.scheduledAt)} (${minutesUntilNext} min).`;
  }

  async handleBreak(businessProfileId: string, minutes: number): Promise<string> {
    const resumeAt = new Date(Date.now() + minutes * 60 * 1000);
    await this.businessProfile.updateQueueState(businessProfileId, {
      isOnBreak: true,
      breakResumesAt: resumeAt,
    });
    return `✅ On break for ${minutes} min. Back at ${this.appointment.formatTime(resumeAt)}.\nCallers will be told next slot is after ${this.appointment.formatTime(resumeAt)}.`;
  }

  async handleBack(businessProfileId: string): Promise<string> {
    await this.businessProfile.updateQueueState(businessProfileId, {
      isOnBreak: false,
      breakResumesAt: null,
    });
    return `✅ Back online. Taking bookings again.`;
  }

  async handleFull(businessProfileId: string): Promise<string> {
    await this.businessProfile.updateQueueState(businessProfileId, { isFullDay: true });
    return `✅ Fully booked today. No new bookings. Callers will be offered tomorrow.`;
  }

  async handleLate(businessProfileId: string, minutes: number): Promise<string> {
    const next = await this.appointment.findNextAppointmentAfter(businessProfileId, new Date());
    if (!next) {
      return `⚠️ Running ${minutes} min late. No upcoming appointments today.`;
    }
    return `⚠️ Running ${minutes} min late. Next: ${next.customerName} at ${this.appointment.formatTime(next.scheduledAt)} — consider calling them.`;
  }

  async handleSchedule(businessProfileId: string): Promise<string> {
    const appointments = await this.appointment.getTodaysAppointments(businessProfileId);
    if (appointments.length === 0) return `📋 No appointments today.`;

    const lines = appointments.map(
      (a) => `${this.appointment.formatTime(a.scheduledAt)} → ${a.customerName} (${a.service})`,
    );

    return `📋 Today's schedule:\n${lines.join('\n')}`;
  }

  async handleTomorrow(businessProfileId: string): Promise<string> {
    const appointments = await this.appointment.getTomorrowsAppointments(businessProfileId);
    if (appointments.length === 0) return `📋 No appointments tomorrow.`;

    const lines = appointments.map(
      (a) => `${this.appointment.formatTime(a.scheduledAt)} → ${a.customerName} (${a.service})`,
    );

    return `📋 Tomorrow's schedule:\n${lines.join('\n')}`;
  }

  async handleWaitlist(businessProfileId: string): Promise<string> {
    const waitlist = await this.appointment.getTodaysWaitlist(businessProfileId);
    if (waitlist.length === 0) return `👥 No one on waitlist today.`;

    const lines = waitlist.map(
      (w, i) => `${i + 1}. ${w.customerName}${w.service ? ` (${w.service})` : ''} — ${w.customerPhone}`,
    );

    return `👥 Waitlist (${waitlist.length}):\n${lines.join('\n')}`;
  }

  async handleCancel(businessProfileId: string, reference: string): Promise<string> {
    // Try matching by time first (e.g. "4pm", "4:30", "16:00")
    const timeStr = this.parseTimeReference(reference);
    let target = timeStr
      ? await this.appointment.findTodaysAppointmentByTime(businessProfileId, timeStr)
      : null;

    // Fall back to matching by customer name
    if (!target) {
      target = await this.appointment.findTodaysAppointmentByName(businessProfileId, reference);
    }

    if (!target) {
      return `❌ No appointment found for "${reference}" today.`;
    }

    await this.appointment.cancelAppointment(target.id, 'Cancelled by owner');

    const waitlist = await this.appointment.getTodaysWaitlist(businessProfileId);
    if (waitlist.length > 0) {
      const first = waitlist[0];
      return (
        `✅ Cancelled: ${target.customerName} at ${this.appointment.formatTime(target.scheduledAt)}.\n` +
        `👥 Waitlist: Call ${first.customerName}: ${first.customerPhone}`
      );
    }

    return `✅ Cancelled: ${target.customerName} at ${this.appointment.formatTime(target.scheduledAt)}. Slot is now open.`;
  }

  async handleArrived(businessProfileId: string, name: string): Promise<string> {
    const target = await this.appointment.findTodaysAppointmentByName(businessProfileId, name);
    if (!target) {
      return `❌ No appointment found for "${name}" today.`;
    }

    await this.appointment.markArrived(target.id);
    return `✅ ${target.customerName} marked arrived. (${target.service} at ${this.appointment.formatTime(target.scheduledAt)})`;
  }

  async handleWalkin(businessProfileId: string, service: string): Promise<string> {
    const profile = await this.businessProfile.getProfileById(businessProfileId);
    const appointment = await this.appointment.createWalkIn(businessProfileId, {
      service,
      priceRs: 0,
      durationMin: 30,
      workspaceId: profile.workspaceId,
    });

    const endTime = new Date(appointment.scheduledAt.getTime() + appointment.durationMin * 60 * 1000);
    return `✅ Walk-in added: ${appointment.service} now → ${this.appointment.formatTime(endTime)}.`;
  }

  private parseTimeReference(reference: string): string | null {
    const amPm = reference.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (amPm) {
      let hours = Number.parseInt(amPm[1], 10);
      const minutes = Number.parseInt(amPm[2] ?? '0', 10);
      const period = amPm[3].toLowerCase();
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    const hhmm = reference.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
      return `${String(Number.parseInt(hhmm[1], 10)).padStart(2, '0')}:${hhmm[2]}`;
    }

    return null;
  }
}
