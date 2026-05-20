import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { AllowApiKeyAuth } from '../auth/api-key-auth.decorator';
import { InteraktService } from '../interakt/interakt.service';
import { RetellService } from '../retell/retell.service';
import {
  BusinessProfileService,
  createBusinessProfileSchema,
  businessServiceSchema,
  type CreateBusinessProfileInput,
} from './business-profile.service';
import { AppointmentService } from './appointment.service';

const updateBusinessProfileSchema = z.object({
  businessName: z.string().min(1).optional(),
  ownerName: z.string().min(1).optional(),
  ownerPhone: z.string().min(10).optional(),
  address: z.string().optional(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
  languages: z.array(z.string()).optional(),
  services: z.array(businessServiceSchema).optional(),
  googleMapsUrl: z.string().url().optional(),
});

@UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
@Controller('business-profiles')
export class BusinessProfileController {
  constructor(
    private readonly businessProfile: BusinessProfileService,
    private readonly appointment: AppointmentService,
    private readonly interakt: InteraktService,
    private readonly retell: RetellService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async createProfile(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(createBusinessProfileSchema)) input: CreateBusinessProfileInput,
  ) {
    const profile = await this.businessProfile.createProfile(ctx.workspaceId, input);

    const webhookUrl = this.config.get<string>('PUBLIC_API_URL') ?? '';
    if (webhookUrl && this.config.get<string>('RETELL_API_KEY')) {
      const { agentId, llmId } = await this.retell.createAgentForBusiness(profile, webhookUrl);
      await this.businessProfile.updateRetellIds(profile.id, agentId, llmId);
      return success({ ...profile, retellAgentId: agentId, retellLlmId: llmId });
    }

    return success(profile);
  }

  @Get()
  async listProfiles(@CurrentContext() ctx: RequestContext) {
    return success(await this.businessProfile.listByWorkspace(ctx.workspaceId));
  }

  @Get(':id/today')
  async getTodaySummary(@CurrentContext() _ctx: RequestContext, @Param('id') id: string) {
    const [profile, appointments, waitlist] = await Promise.all([
      this.businessProfile.getProfileById(id),
      this.appointment.getTodaysAppointments(id),
      this.appointment.getTodaysWaitlist(id),
    ]);

    const revenue = appointments
      .filter((a) => a.status === 'completed')
      .reduce((sum, a) => sum + a.priceRs, 0);

    return success({
      profile,
      appointments,
      waitlist,
      stats: {
        totalToday: appointments.length,
        completed: appointments.filter((a) => a.status === 'completed').length,
        arrived: appointments.filter((a) => a.status === 'arrived').length,
        upcoming: appointments.filter((a) => a.status === 'confirmed').length,
        waitlistCount: waitlist.length,
        revenueRs: revenue,
      },
    });
  }

  @Get('by-retell-agent/:retellAgentId')
  async getProfileByRetellAgent(
    @CurrentContext() _ctx: RequestContext,
    @Param('retellAgentId') retellAgentId: string,
  ) {
    return success(await this.businessProfile.getProfileByRetellAgentId(retellAgentId));
  }

  @Get(':id')
  async getProfile(@CurrentContext() _ctx: RequestContext, @Param('id') id: string) {
    return success(await this.businessProfile.getProfileById(id));
  }

  // ─── Appointment actions ──────────────────────────────────────────────────

  @Post(':id/appointments/:aptId/arrived')
  @HttpCode(200)
  async markArrived(
    @CurrentContext() _ctx: RequestContext,
    @Param('aptId') aptId: string,
  ) {
    return success(await this.appointment.markArrived(aptId));
  }

  @Post(':id/appointments/:aptId/done')
  @HttpCode(200)
  async markDone(
    @CurrentContext() _ctx: RequestContext,
    @Param('id') id: string,
    @Param('aptId') aptId: string,
  ) {
    const [apt, profile] = await Promise.all([
      this.appointment.markCompleted(aptId),
      this.businessProfile.getProfileById(id),
    ]);

    const [next, waitlist] = await Promise.all([
      this.appointment.findNextAppointmentAfter(id, new Date()),
      this.appointment.getTodaysWaitlist(id),
    ]);

    let msg = `✅ Done with ${apt.customerName}.`;
    if (next) {
      const gap = Math.round((next.scheduledAt.getTime() - Date.now()) / 60000);
      msg += ` Next: ${next.customerName} in ${gap} min.`;
    } else if (waitlist.length > 0) {
      msg += ` 👥 ${waitlist[0].customerName} on waitlist: ${waitlist[0].customerPhone}`;
    } else {
      msg += ` No more appointments today.`;
    }

    try {
      await this.interakt.sendTextToOwner(profile.ownerPhone, msg);
    } catch {
      // WhatsApp failure shouldn't fail the HTTP response
    }

    return success(apt);
  }

  @Post(':id/appointments/:aptId/cancel')
  @HttpCode(200)
  async cancelAppointment(
    @CurrentContext() _ctx: RequestContext,
    @Param('aptId') aptId: string,
  ) {
    return success(await this.appointment.cancelAppointment(aptId, 'Cancelled from dashboard'));
  }

  // ─── Profile update ───────────────────────────────────────────────────────

  @Patch(':id')
  @WorkspaceRoles('owner', 'admin', 'developer')
  async updateProfile(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBusinessProfileSchema)) input: z.infer<typeof updateBusinessProfileSchema>,
  ) {
    const profile = await this.businessProfile.updateProfile(id, ctx.workspaceId, input);

    const affectsPrompt =
      input.services || input.openTime || input.closeTime ||
      input.businessName || input.languages || input.address;

    if (affectsPrompt && profile.retellLlmId) {
      await this.retell.updateAgentPrompt(profile.retellLlmId, profile);
    }

    return success(profile);
  }
}
