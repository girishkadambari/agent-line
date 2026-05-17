import { Injectable } from '@nestjs/common';
import { Prisma, type Conversation } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { AgentLineEvent, EventResourceType } from '../../domain/events';
import type { UpdateConversationInput } from '../../domain/schemas';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { serializeConversation } from './conversations.serializer';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly webhooks: WebhooksService,
  ) {}

  async findOrCreateSmsConversation(context: RequestContext, agentId: string, contactId: string) {
    return this.findOrCreateConversation(context, agentId, contactId, 'sms');
  }

  async findOrCreateVoiceConversation(context: RequestContext, agentId: string, contactId: string) {
    return this.findOrCreateConversation(context, agentId, contactId, 'voice');
  }

  private async findOrCreateConversation(
    context: RequestContext,
    agentId: string,
    contactId: string,
    channel: 'sms' | 'voice',
  ) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId,
        contactId,
        channel,
      },
    });

    if (existing) {
      return this.prisma.conversation.update({
        where: { id: existing.id },
        data: { lastActivityAt: new Date() },
      });
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        id: createId('conv'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId,
        contactId,
        channel,
      },
    });
    await this.emitConversationEvent(context, AgentLineEvent.ConversationCreated, conversation);

    return conversation;
  }

  async listConversations(context: RequestContext, limit: number) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
      orderBy: { lastActivityAt: 'desc' },
      take: limit,
    });

    return list(conversations.map(serializeConversation), { limit, nextCursor: null });
  }

  async getConversation(context: RequestContext, id: string) {
    const conversation = await this.findConversationOrThrow(context, id);
    return serializeConversation(conversation);
  }

  async updateConversation(context: RequestContext, id: string, input: UpdateConversationInput) {
    await this.findConversationOrThrow(context, id);

    const conversation = await this.prisma.conversation.update({
      where: { id },
      data: {
        status: input.status,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    await this.emitConversationEvent(context, AgentLineEvent.ConversationUpdated, conversation);

    return serializeConversation(conversation);
  }

  private async emitConversationEvent(
    context: RequestContext,
    type: string,
    conversation: Conversation,
  ) {
    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type,
      resourceType: EventResourceType.Conversation,
      resourceId: conversation.id,
      payload: {
        conversationId: conversation.id,
        agentId: conversation.agentId,
        contactId: conversation.contactId,
        channel: conversation.channel,
        status: conversation.status,
        lastActivityAt: conversation.lastActivityAt.toISOString(),
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
    });
    await this.webhooks.createDeliveriesForEvent(event);
  }

  async findConversationOrThrow(context: RequestContext, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
    });

    if (!conversation) {
      throw new ApiException('not_found', 'Conversation not found.', 404, { id });
    }

    return conversation;
  }
}
