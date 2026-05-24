import { Injectable } from '@nestjs/common';
import { Prisma, type Conversation } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { VukhoEvent, EventResourceType } from '../../domain/events';
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

    const conversationId = createId('conv');
    const conversation = await this.prisma.conversation
      .create({
        data: {
          id: conversationId,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          agentId,
          contactId,
          channel,
        },
      })
      .catch(async (error) => {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }

        return this.prisma.conversation.update({
          where: {
            projectId_agentId_contactId_channel: {
              projectId: context.projectId,
              agentId,
              contactId,
              channel,
            },
          },
          data: { lastActivityAt: new Date() },
        });
      });

    if (conversation.id !== conversationId) {
      return conversation;
    }

    await this.emitConversationEvent(context, VukhoEvent.ConversationCreated, conversation);

    return conversation;
  }

  async listConversations(
    context: RequestContext,
    limit: number,
    filters: {
      cursor?: string;
      agentId?: string;
      contactId?: string;
      channel?: string;
      status?: string;
    } = {},
  ) {
    const where: Prisma.ConversationWhereInput = {
      workspaceId: context.workspaceId,
      projectId: context.projectId,
    };

    if (filters.agentId) {
      where.agentId = filters.agentId;
    }
    if (filters.contactId) {
      where.contactId = filters.contactId;
    }
    if (filters.channel) {
      where.channel = filters.channel as Prisma.EnumConversationChannelFilter;
    }
    if (filters.status) {
      where.status = filters.status as Prisma.EnumConversationStatusFilter;
    }

    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: { lastActivityAt: 'desc' },
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    const hasMore = conversations.length > limit;
    const page = hasMore ? conversations.slice(0, limit) : conversations;

    return list(page.map(serializeConversation), {
      limit,
      hasMore,
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    });
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

    await this.emitConversationEvent(context, VukhoEvent.ConversationUpdated, conversation);

    return serializeConversation(conversation);
  }

  /**
   * Send a typing indicator for an agent in a conversation.
   * Returns `{ conversationId, sentAt }` as the SDK expects.
   */
  async sendTypingIndicator(context: RequestContext, conversationId: string) {
    await this.findConversationOrThrow(context, conversationId);
    const sentAt = new Date().toISOString();

    // Emit a typing event so webhook subscribers and SSE listeners are notified.
    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: VukhoEvent.ConversationTyping,
      resourceType: EventResourceType.Conversation,
      resourceId: conversationId,
      payload: { conversationId, sentAt },
    });
    await this.webhooks.createDeliveriesForEvent(event);

    return { conversationId, sentAt };
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

  private isUniqueConstraintError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
