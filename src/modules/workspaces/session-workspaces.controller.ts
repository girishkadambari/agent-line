import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { acceptInviteSchema, createWorkspaceSchema } from '../../domain/schemas';
import { CurrentUser } from '../auth/current-user.decorator';
import { CsrfGuard } from '../auth/csrf.guard';
import { SessionAuthService } from '../auth/session-auth.service';
import { SessionGuard, type SessionUser } from '../auth/session.guard';
import { WorkspacesService } from './workspaces.service';

@UseGuards(SessionGuard, CsrfGuard)
@Controller('workspaces')
export class SessionWorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly sessions: SessionAuthService,
  ) {}

  @Get()
  listWorkspaces(@CurrentUser() user: SessionUser, @Query('limit') limit?: string) {
    return this.workspaces.listUserWorkspaces(user.id, parseLimit(limit));
  }

  @Post()
  async createWorkspace(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createWorkspaceSchema)) body: unknown,
  ) {
    return success(await this.workspaces.createWorkspaceForUser(user.id, createWorkspaceSchema.parse(body)));
  }

  @Post(':workspaceId/switch')
  async switchWorkspace(
    @CurrentUser() user: SessionUser,
    @CurrentContext() context: RequestContext,
    @Param('workspaceId') workspaceId: string,
    @Body() body: { projectId?: string } = {},
  ) {
    return success(await this.sessions.switchWorkspace(user.id, context.sessionId ?? '', workspaceId, body.projectId));
  }

  @Post('invites/accept')
  async acceptInvite(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: unknown,
  ) {
    return success(await this.workspaces.acceptInvite(user.id, user.email, acceptInviteSchema.parse(body)));
  }
}
