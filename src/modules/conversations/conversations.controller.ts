import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { updateConversationSchema } from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { AllowApiKeyAuth } from '../auth/api-key-auth.decorator';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { ConversationsService } from './conversations.service';

@UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  listConversations(
    @CurrentContext() context: RequestContext,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('agentId') agentId?: string,
    @Query('contactId') contactId?: string,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
  ) {
    return this.conversations.listConversations(context, parseLimit(limit), {
      cursor,
      agentId,
      contactId,
      channel,
      status,
    });
  }

  @Get(':id')
  async getConversation(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.conversations.getConversation(context, id));
  }

  @Patch(':id')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async updateConversation(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateConversationSchema)) body: unknown,
  ) {
    return success(
      await this.conversations.updateConversation(
        context,
        id,
        updateConversationSchema.parse(body),
      ),
    );
  }

  @Post(':id/typing')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async sendTypingIndicator(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
  ) {
    return success(await this.conversations.sendTypingIndicator(context, id));
  }
}
