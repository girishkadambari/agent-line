import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type { TelecomProvider } from '../../domain/provider';
import type { SendMessageInput, SimulateInboundSmsInput } from '../../domain/schemas';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationsService } from '../conversations/conversations.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { TELECOM_PROVIDER } from '../providers/providers.constants';
import { UsageService } from '../usage/usage.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { serializeMessage } from './messages.serializer';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
    private readonly events: EventsService,
    @Inject(TELECOM_PROVIDER) private readonly telecomProvider: TelecomProvider,
    private readonly usage: UsageService,
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
    const messageId = createId('msg');
    await this.usage.recordSms({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      agentId: agent.id,
      messageId,
      direction: 'outbound',
    });

    let providerSent = false;
    try {
      await this.prisma.message.create({
        data: {
          id: messageId,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          agentId: agent.id,
          conversationId: conversation.id,
          phoneNumberId: phoneNumber.id,
          contactId: contact.id,
          direction: 'outbound',
          body: input.body,
          status: 'sending',
          provider: phoneNumber.provider,
        },
      });

      const sent = await this.telecomProvider.sendSms({
        from: phoneNumber.phoneNumber,
        to: input.to,
        body: input.body,
      });
      providerSent = true;

      const message = await this.prisma.message.update({
        where: { id: messageId },
        data: {
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
    } catch (error) {
      if (!providerSent) {
        await this.usage.voidUsageForFailedOperation({
          workspaceId: context.workspaceId,
          resourceType: 'message',
          resourceId: messageId,
        });
      }
      await this.prisma.message
        .update({
          where: { id: messageId },
          data: { status: 'failed' },
        })
        .catch(() => undefined);
      throw error;
    }
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

    const messageId = createId('msg');
    await this.usage.recordSms({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      agentId: agent.id,
      messageId,
      direction: 'inbound',
    });

    const message = await this.prisma.message.create({
      data: {
        id: messageId,
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

  async receiveProviderInboundSms(input: {
    provider: 'twilio';
    providerEventId: string;
    from: string;
    to: string;
    body: string;
    rawPayload: Record<string, unknown>;
  }) {
    const existing = await this.prisma.message.findFirst({
      where: {
        provider: input.provider,
        providerMessageId: input.providerEventId,
      },
    });
    if (existing) {
      return { received: true, duplicate: true, ignored: false, message: serializeMessage(existing) };
    }

    const phoneNumber = await this.prisma.phoneNumber.findFirst({
      where: {
        phoneNumber: input.to,
        provider: input.provider,
        status: 'active',
        capabilities: { has: 'sms' },
      },
    });
    if (!phoneNumber?.agentId) {
      return { received: true, duplicate: false, ignored: true };
    }

    const context = {
      workspaceId: phoneNumber.workspaceId,
      projectId: phoneNumber.projectId,
      apiKeyId: 'provider:twilio',
    };
    const recorded = await this.recordProviderRawEvent({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: 'twilio.sms.inbound',
      payload: input.rawPayload,
    });
    if (!recorded) {
      return { received: true, duplicate: true, ignored: false };
    }

    const contact = await this.contacts.findOrCreateByPhoneNumber(context, input.from);
    const conversation = await this.conversations.findOrCreateSmsConversation(
      context,
      phoneNumber.agentId,
      contact.id,
    );

    const messageId = createId('msg');
    await this.usage.recordSms({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      agentId: phoneNumber.agentId,
      messageId,
      direction: 'inbound',
    });

    const message = await this.prisma.message.create({
      data: {
        id: messageId,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: phoneNumber.agentId,
        conversationId: conversation.id,
        phoneNumberId: phoneNumber.id,
        contactId: contact.id,
        direction: 'inbound',
        body: input.body,
        status: 'received',
        provider: input.provider,
        providerMessageId: input.providerEventId,
      },
    });

    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: 'agent.message.received',
      resourceType: 'message',
      resourceId: message.id,
      payload: {
        agentId: phoneNumber.agentId,
        conversationId: conversation.id,
        contactId: contact.id,
      },
    });
    await this.webhooks.createDeliveriesForEvent(event);

    return { received: true, duplicate: false, ignored: false, message: serializeMessage(message) };
  }

  async receiveProviderSmsStatus(input: {
    provider: 'twilio';
    providerMessageId: string;
    status: string;
    rawPayload: Record<string, unknown>;
  }) {
    const message = await this.prisma.message.findFirst({
      where: {
        provider: input.provider,
        providerMessageId: input.providerMessageId,
      },
    });
    if (!message) {
      return { received: true, ignored: true };
    }

    const recorded = await this.recordProviderRawEvent({
      workspaceId: message.workspaceId,
      projectId: message.projectId,
      provider: input.provider,
      providerEventId: `${input.providerMessageId}:${input.status}`,
      eventType: 'twilio.sms.status',
      payload: input.rawPayload,
    });
    if (!recorded) {
      return { received: true, duplicate: true, ignored: false, message: serializeMessage(message) };
    }

    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { status: this.normalizeProviderMessageStatus(input.status) },
    });

    const event = await this.events.create({
      workspaceId: message.workspaceId,
      projectId: message.projectId,
      type: 'agent.message.delivery_updated',
      resourceType: 'message',
      resourceId: message.id,
      payload: {
        agentId: message.agentId,
        conversationId: message.conversationId,
        status: updated.status,
      },
    });
    await this.webhooks.createDeliveriesForEvent(event);

    return { received: true, ignored: false, message: serializeMessage(updated) };
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

  private normalizeProviderMessageStatus(status: string): 'sent' | 'delivered' | 'failed' {
    if (status === 'delivered') {
      return 'delivered';
    }
    if (['failed', 'undelivered'].includes(status)) {
      return 'failed';
    }
    return 'sent';
  }

  private async recordProviderRawEvent(input: {
    workspaceId: string;
    projectId: string;
    provider: 'twilio';
    providerEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }) {
    try {
      await this.prisma.providerRawEvent.create({
        data: {
          id: createId('prevt'),
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          provider: input.provider,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          payload: input.payload as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }
}
