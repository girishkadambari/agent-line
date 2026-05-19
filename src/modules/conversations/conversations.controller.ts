import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { updateConversationSchema } from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { ConversationsService } from './conversations.service';

@UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  listConversations(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.conversations.listConversations(context, parseLimit(limit));
  }

  @Get(':id')
  async getConversation(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.conversations.getConversation(context, id));
  }

  @Patch(':id')
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
}
