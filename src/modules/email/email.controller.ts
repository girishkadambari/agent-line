import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { parseLimit } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { EmailService } from './email.service';

@UseGuards(AuthContextGuard, WorkspaceRoleGuard)
@Controller('email')
@WorkspaceRoles('owner', 'admin')
export class EmailController {
  constructor(private readonly email: EmailService) {}

  @Get('deliveries')
  listDeliveries(
    @CurrentContext() context: RequestContext,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('template') template?: string,
    @Query('recipientEmail') recipientEmail?: string,
  ) {
    return this.email.listDeliveries(context, {
      limit: parseLimit(limit),
      status,
      template,
      recipientEmail,
    });
  }
}
