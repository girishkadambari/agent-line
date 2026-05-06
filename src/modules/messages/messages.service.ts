import { Injectable } from '@nestjs/common';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type { SendMessageInput, SimulateInboundSmsInput } from '../../domain/schemas';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationsService } from '../conversations/conversations.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockProviderService } from '../providers/mock/mock-provider.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { serializeMessage } from './messages.serializer';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
    private readonly events: EventsService,
    private readonly mockProvider: MockProviderService,
    private readonly webhooks: WebhooksService,
  ) {}

  async sendMessage(context: RequestContext, input: SendMessageInput) {
    const agent = await this.findAgentOrThrow(context, input.agentId);
    const phoneNumber = await this.findSmsCapableNumberOrThrow(context, agent.id);
    const contact = await this.contacts.findOrCreateByPhoneNumber(context, input.to);
    const conversation = await this.conversations.findOrCreateSmsConversation(
      context,
      agent.id,
      contact.id,
    );
    const sent = await this.mockProvider.sendSms({
      from: phoneNumber.phoneNumber,
      to: input.to,
      body: input.body,
    });

    const message = await this.prisma.message.create({
      data: {
        id: createId('msg'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: agent.id,
        conversationId: conversation.id,
        phoneNumberId: phoneNumber.id,
        contactId: contact.id,
        direction: 'outbound',
        body: input.body,
        status: sent.status,
        provider: sent.provider,
        providerMessageId: sent.providerMessageId,
      },
    });

    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: 'agent.message.sent',
      resourceType: 'message',
      resourceId: message.id,
      payload: {
        agentId: agent.id,
        conversationId: conversation.id,
        contactId: contact.id,
      },
    });
    await this.webhooks.createDeliveriesForEvent(event);

    return serializeMessage(message);
  }

  async simulateInboundSms(context: RequestContext, input: SimulateInboundSmsInput) {
    const agent = await this.findAgentOrThrow(context, input.agentId);
    const phoneNumber = await this.findSmsCapableNumberOrThrow(context, agent.id);
    const contact = await this.contacts.findOrCreateByPhoneNumber(context, input.from);
    const conversation = await this.conversations.findOrCreateSmsConversation(
      context,
      agent.id,
      contact.id,
    );

    const message = await this.prisma.message.create({
      data: {
        id: createId('msg'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: agent.id,
        conversationId: conversation.id,
        phoneNumberId: phoneNumber.id,
        contactId: contact.id,
        direction: 'inbound',
        body: input.body,
        status: 'received',
        provider: 'mock',
        providerMessageId: `mock_inbound_${Date.now()}`,
      },
    });

    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: 'agent.message.received',
      resourceType: 'message',
      resourceId: message.id,
      payload: {
        agentId: agent.id,
        conversationId: conversation.id,
        contactId: contact.id,
      },
    });
    await this.webhooks.createDeliveriesForEvent(event);

    return serializeMessage(message);
  }

  async listConversationMessages(context: RequestContext, conversationId: string, limit: number) {
    await this.conversations.findConversationOrThrow(context, conversationId);

    const messages = await this.prisma.message.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        conversationId,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return list(messages.map(serializeMessage), { limit, nextCursor: null });
  }

  async addReaction(context: RequestContext, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
    });

    if (!message) {
      throw new ApiException('not_found', 'Message not found.', 404, { messageId });
    }

    return serializeMessage(message);
  }

  private async findAgentOrThrow(context: RequestContext, agentId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        id: agentId,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        status: 'active',
      },
      select: { id: true },
    });

    if (!agent) {
      throw new ApiException('not_found', 'Agent not found.', 404, { agentId });
    }

    return agent;
  }

  private async findSmsCapableNumberOrThrow(context: RequestContext, agentId: string) {
    const phoneNumber = await this.prisma.phoneNumber.findFirst({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId,
        status: 'active',
        capabilities: { has: 'sms' },
      },
    });

    if (!phoneNumber) {
      throw new ApiException('conflict', 'Agent does not have an active SMS-capable number.', 409, {
        agentId,
      });
    }

    return phoneNumber;
  }
}
