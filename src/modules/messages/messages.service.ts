import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Message } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { VukhoEvent, EventResourceType } from '../../domain/events';
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
          providerStatus: sent.status,
          providerErrorCode: null,
          providerErrorText: null,
        },
      });

      const event = await this.events.create({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        type: VukhoEvent.MessageSent,
        resourceType: EventResourceType.Message,
        resourceId: message.id,
        payload: this.buildMessageEventPayload(message),
      });
      await this.webhooks.createDeliveriesForEvent(event);

      return serializeMessage(message);
    } catch (error) {
      if (!providerSent) {
        await this.usage.voidUsageForFailedOperation({
          workspaceId: context.workspaceId,
          resourceType: EventResourceType.Message,
          resourceId: messageId,
        });
      }
      await this.prisma.message
        .update({
          where: { id: messageId },
          data: {
            status: 'failed',
            ...this.providerFailureUpdate(error),
          },
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
      type: VukhoEvent.MessageReceived,
      resourceType: EventResourceType.Message,
      resourceId: message.id,
      payload: this.buildMessageEventPayload(message),
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
      return {
        received: true,
        duplicate: true,
        ignored: false,
        message: serializeMessage(existing),
      };
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
        providerStatus: 'received',
      },
    });

    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: VukhoEvent.MessageReceived,
      resourceType: EventResourceType.Message,
      resourceId: message.id,
      payload: this.buildMessageEventPayload(message),
    });
    await this.webhooks.createDeliveriesForEvent(event);

    return { received: true, duplicate: false, ignored: false, message: serializeMessage(message) };
  }

  async receiveProviderSmsStatus(input: {
    provider: 'twilio';
    providerMessageId: string;
    status: string;
    providerErrorCode?: string;
    providerErrorText?: string;
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
      return {
        received: true,
        duplicate: true,
        ignored: false,
        message: serializeMessage(message),
      };
    }

    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: {
        status: this.normalizeProviderMessageStatus(input.status),
        providerStatus: input.status,
        providerErrorCode: input.providerErrorCode ?? null,
        providerErrorText: input.providerErrorText ?? null,
      },
    });

    const event = await this.events.create({
      workspaceId: message.workspaceId,
      projectId: message.projectId,
      type: VukhoEvent.MessageDeliveryUpdated,
      resourceType: EventResourceType.Message,
      resourceId: message.id,
      payload: this.buildMessageEventPayload(updated, { providerStatus: input.status }),
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

  private buildMessageEventPayload(
    message: Pick<
      Message,
      | 'id'
      | 'agentId'
      | 'conversationId'
      | 'contactId'
      | 'phoneNumberId'
      | 'direction'
      | 'body'
      | 'status'
      | 'provider'
      | 'providerMessageId'
      | 'providerStatus'
      | 'providerErrorCode'
      | 'providerErrorText'
      | 'createdAt'
      | 'updatedAt'
    >,
    extra: Record<string, unknown> = {},
  ) {
    return {
      agentId: message.agentId,
      messageId: message.id,
      conversationId: message.conversationId,
      contactId: message.contactId,
      phoneNumberId: message.phoneNumberId,
      direction: message.direction,
      body: message.body,
      status: message.status,
      provider: message.provider,
      providerMessageId: message.providerMessageId,
      providerStatus: message.providerStatus,
      providerErrorCode: message.providerErrorCode,
      providerErrorText: message.providerErrorText,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      ...extra,
    };
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

  private providerFailureUpdate(error: unknown) {
    if (error instanceof ApiException) {
      return {
        providerErrorCode: this.stringifyDetail(error.details.code),
        providerErrorText: this.stringifyDetail(error.details.message) ?? error.message,
      };
    }

    return {
      providerErrorCode: null,
      providerErrorText: error instanceof Error ? error.message : 'Provider request failed.',
    };
  }

  private stringifyDetail(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return null;
  }
}
