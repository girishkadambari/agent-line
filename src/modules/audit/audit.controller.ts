import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { parseLimit } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { AuditService } from './audit.service';

@UseGuards(AuthContextGuard)
@Controller('audit-events')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  listAuditEvents(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.audit.listForWorkspace(context, parseLimit(limit));
  }
}
