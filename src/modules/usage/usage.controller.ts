import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { parseLimit } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { usageQuerySchema } from '../../domain/schemas';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { UsageService } from './usage.service';

@UseGuards(ApiKeyGuard)
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) { }

  @Get()
  listUsage(
    @CurrentContext() context: RequestContext,
    @Query(new ZodValidationPipe(usageQuerySchema)) query: unknown,
  ) {
    const parsed = usageQuerySchema.parse(query);
    return this.usage.listUsage(context, parsed, parseLimit(parsed.limit));
  }

  @Get('daily')
  dailyUsage(
    @CurrentContext() context: RequestContext,
    @Query(new ZodValidationPipe(usageQuerySchema)) query: unknown,
  ) {
    return this.usage.getDailyUsage(context, usageQuerySchema.parse(query));
  }

  @Get('monthly')
  monthlyUsage(
    @CurrentContext() context: RequestContext,
    @Query(new ZodValidationPipe(usageQuerySchema)) query: unknown,
  ) {
    return this.usage.getMonthlyUsage(context, usageQuerySchema.parse(query));
  }
}
