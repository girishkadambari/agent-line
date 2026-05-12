import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { sendMessageSchema } from '../../domain/schemas';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { MessagesService } from './messages.service';

@UseGuards(ApiKeyGuard)
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('messages')
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
  async addReaction(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.messages.addReaction(context, id));
  }
}
