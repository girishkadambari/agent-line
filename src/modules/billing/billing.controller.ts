import { Controller, Get, UseGuards } from '@nestjs/common';

import { success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { BillingService } from './billing.service';

@UseGuards(ApiKeyGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('balance')
  async getBalance(@CurrentContext() context: RequestContext) {
    return success(await this.billing.getBalance(context));
  }
}
