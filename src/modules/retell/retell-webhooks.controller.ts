import { Body, Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ApiException } from '../../common/errors/api.exception';
import { AppointmentService } from '../business/appointment.service';
import { BusinessProfileService } from '../business/business-profile.service';
import { RetellService } from './retell.service';

interface RetellFunctionCallBody {
  call: {
    call_id: string;
    agent_id: string;
    metadata?: Record<string, string>;
  };
  name: string;
  // Retell sends function arguments as either `args` or `arguments` depending on version
  args?: Record<string, string>;
  arguments?: Record<string, string>;
}

interface RetellCallStatusBody {
  call: {
    call_id: string;
    agent_id: string;
    call_status: string;
    metadata?: Record<string, string>;
  };
  event: string;
}

@Controller('webhooks/retell')
export class RetellWebhooksController {
  constructor(
    private readonly retell: RetellService,
    private readonly appointment: AppointmentService,
    private readonly businessProfile: BusinessProfileService,
  ) {}

  @Post('function-call')
  @HttpCode(200)
  async handleFunctionCall(
    @Body() body: RetellFunctionCallBody,
    @Headers('x-retell-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    this.verifySignature(req, signature);

    let businessProfileId = body.call?.metadata?.businessProfileId;

    // Fallback: look up by retellAgentId (covers browser test calls where metadata may be absent)
    if (!businessProfileId && body.call?.agent_id) {
      const profile = await this.businessProfile.getProfileByRetellAgentId(body.call.agent_id).catch(() => null);
      businessProfileId = profile?.id;
    }

    if (!businessProfileId) {
      throw new ApiException('invalid_request', 'Cannot resolve businessProfileId from call.', 400);
    }

    const fnArgs = body.args ?? body.arguments ?? {};

    if (body.name === 'check_availability') {
      return this.appointment.checkAvailability(businessProfileId, {
        time: fnArgs.time,
        date: fnArgs.date,
      });
    }

    if (body.name === 'create_booking') {
      return this.appointment.createAppointmentFromCall(businessProfileId, body.call.call_id, {
        customer_name: fnArgs.customer_name,
        service: fnArgs.service,
        time: fnArgs.time,
        date: fnArgs.date,
        customer_phone: fnArgs.customer_phone,
      });
    }

    if (body.name === 'add_to_waitlist') {
      return this.appointment.addToWaitlist(businessProfileId, {
        customer_name: fnArgs.customer_name,
        service: fnArgs.service,
        customer_phone: fnArgs.customer_phone,
      });
    }

    if (body.name === 'get_available_slots') {
      return this.appointment.getAvailableSlots(businessProfileId, fnArgs.date);
    }

    if (body.name === 'cancel_booking') {
      return this.appointment.cancelFromCall(businessProfileId, {
        customer_phone: fnArgs.customer_phone,
        time: fnArgs.time,
      });
    }

    throw new ApiException('invalid_request', `Unknown function: ${body.name}`, 400);
  }

  @Post('call-status')
  @HttpCode(200)
  async handleCallStatus(
    @Body() body: RetellCallStatusBody,
    @Headers('x-retell-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    this.verifySignature(req, signature);
    return { received: true };
  }

  private verifySignature(req: RawBodyRequest<Request>, signature: string) {
    const rawBody = req.rawBody?.toString() ?? '';
    if (!this.retell.verifyWebhookSignature(rawBody, signature)) {
      throw new ApiException('unauthorized', 'Invalid Retell webhook signature.', 401);
    }
  }
}
