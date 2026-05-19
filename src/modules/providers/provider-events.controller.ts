import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { ProviderEventsService } from './provider-events.service';

@UseGuards(AuthContextGuard)
@Controller('provider-events')
export class ProviderEventsController {
  constructor(private readonly providerEvents: ProviderEventsService) {}

  @Get()
  listProviderEvents(
    @CurrentContext() context: RequestContext,
    @Query('limit') limit?: string,
    @Query('eventType') eventType?: string,
    @Query('providerEventId') providerEventId?: string,
  ) {
    return this.providerEvents.listProviderEvents(context, parseLimit(limit), {
      eventType,
      providerEventId,
    });
  }

  @Get('summary')
  async getProviderEventSummary(@CurrentContext() context: RequestContext) {
    return success(await this.providerEvents.getProviderEventSummary(context));
  }
}
