import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { parseLimit } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { usageQuerySchema } from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { AllowApiKeyAuth } from '../auth/api-key-auth.decorator';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { UsageService } from './usage.service';

@UseGuards(AuthContextGuard, WorkspaceRoleGuard)
@Controller('usage')
@AllowApiKeyAuth()
@WorkspaceRoles('owner', 'admin', 'developer', 'billing')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

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
