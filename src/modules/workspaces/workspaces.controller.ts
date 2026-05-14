import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createInviteSchema,
  updateMemberSchema,
  updateWorkspaceSchema,
} from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspacesService } from './workspaces.service';

@UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
@Controller('workspaces/current')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  async getCurrentWorkspace(@CurrentContext() context: RequestContext) {
    return success(await this.workspaces.getCurrentWorkspace(context));
  }

  @Get('settings')
  async getCurrentWorkspaceSettings(@CurrentContext() context: RequestContext) {
    return success(await this.workspaces.getCurrentWorkspaceSettings(context));
  }

  @Patch()
  @WorkspaceRoles('owner', 'admin')
  async updateCurrentWorkspace(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(updateWorkspaceSchema)) body: unknown,
  ) {
    return success(
      await this.workspaces.updateCurrentWorkspace(context, updateWorkspaceSchema.parse(body)),
    );
  }

  @Get('members')
  listMembers(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.workspaces.listMembers(context, parseLimit(limit));
  }

  @Patch('members/:memberId')
  @WorkspaceRoles('owner', 'admin')
  async updateMember(
    @CurrentContext() context: RequestContext,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: unknown,
  ) {
    return success(
      await this.workspaces.updateMember(context, memberId, updateMemberSchema.parse(body)),
    );
  }

  @Delete('members/:memberId')
  @WorkspaceRoles('owner', 'admin')
  async removeMember(
    @CurrentContext() context: RequestContext,
    @Param('memberId') memberId: string,
  ) {
    return success(await this.workspaces.removeMember(context, memberId));
  }

  @Get('invites')
  listInvites(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.workspaces.listInvites(context, parseLimit(limit));
  }

  @Post('invites')
  @WorkspaceRoles('owner', 'admin')
  async createInvite(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createInviteSchema)) body: unknown,
  ) {
    return success(await this.workspaces.createInvite(context, createInviteSchema.parse(body)));
  }

  @Delete('invites/:inviteId')
  @WorkspaceRoles('owner', 'admin')
  async revokeInvite(
    @CurrentContext() context: RequestContext,
    @Param('inviteId') inviteId: string,
  ) {
    return success(await this.workspaces.revokeInvite(context, inviteId));
  }

  @Post('invites/:inviteId/resend')
  @WorkspaceRoles('owner', 'admin')
  async resendInvite(
    @CurrentContext() context: RequestContext,
    @Param('inviteId') inviteId: string,
  ) {
    return success(await this.workspaces.resendInvite(context, inviteId));
  }
}
