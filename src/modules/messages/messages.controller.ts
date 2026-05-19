import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { sendMessageSchema } from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { AllowApiKeyAuth } from '../auth/api-key-auth.decorator';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { MessagesService } from './messages.service';

@UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('messages')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async sendMessage(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: unknown,
  ) {
    return success(await this.messages.sendMessage(context, sendMessageSchema.parse(body)));
  }

  @Get('conversations/:id/messages')
  listConversationMessages(
    @CurrentContext() context: RequestContext,
    @Param('id') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.messages.listConversationMessages(context, conversationId, parseLimit(limit));
  }

  @Post('messages/:id/reactions')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer', 'member')
  async addReaction(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.messages.addReaction(context, id));
  }
}
