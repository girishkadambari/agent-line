import { Controller, Get, UseGuards } from '@nestjs/common';

import { success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(AuthContextGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  async getSummary(@CurrentContext() context: RequestContext) {
    return success(await this.dashboard.getSummary(context));
  }
}
