import type { PrismaService } from '../prisma/prisma.service';
import type { ContactsService } from '../contacts/contacts.service';
import type { ConversationsService } from '../conversations/conversations.service';
import type { EventsService } from '../events/events.service';
import { MockProviderService } from '../providers/mock/mock-provider.service';
import type { UsageService } from '../usage/usage.service';
import type { WebhooksService } from '../webhooks/webhooks.service';
import { MessagesService } from './messages.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

const now = new Date('2026-05-06T00:00:00.000Z');

function messageFixture(overrides = {}) {
  return {
    id: 'msg_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    conversationId: 'conv_123',
    phoneNumberId: 'num_123',
    contactId: 'ctc_123',
    direction: 'outbound',
    body: 'Hello',
    status: 'delivered',
    provider: 'mock',
    providerMessageId: 'mock_msg_123',
    providerStatus: 'delivered',
    providerErrorCode: null,
    providerErrorText: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createService(prisma: PrismaService) {
  const contacts = {
    findOrCreateByPhoneNumber: jest.fn().mockResolvedValue({ id: 'ctc_123' }),
  } as unknown as ContactsService;
  const conversations = {
    findOrCreateSmsConversation: jest.fn().mockResolvedValue({ id: 'conv_123' }),
    findConversationOrThrow: jest.fn().mockResolvedValue({ id: 'conv_123' }),
  } as unknown as ConversationsService;
  const events = {
    create: jest.fn().mockResolvedValue({ id: 'evt_123' }),
  } as unknown as EventsService;
  const webhooks = {
    createDeliveriesForEvent: jest.fn().mockResolvedValue([]),
  } as unknown as WebhooksService;
  const usage = {
    recordSms: jest.fn().mockResolvedValue({ id: 'use_123' }),
    voidUsageForFailedOperation: jest.fn().mockResolvedValue({ voided: true, refundedCents: 1 }),
  } as unknown as UsageService;
  const provider = new MockProviderService();

  return {
    service: new MessagesService(
      prisma,
      contacts,
      conversations,
      events,
      provider,
      usage,
      webhooks,
    ),
    contacts,
    conversations,
    events,
    usage,
    webhooks,
  };
}

describe('MessagesService', () => {
  it('sends outbound SMS and creates message event', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'num_123',
          phoneNumber: '+14155551000',
        }),
      },
      message: {
        create: jest
          .fn()
          .mockResolvedValue(messageFixture({ status: 'sending', providerMessageId: null })),
        update: jest.fn().mockResolvedValue(messageFixture()),
      },
    } as unknown as PrismaService;
    const { service, events } = createService(prisma);

    const result = await service.sendMessage(context, {
      agentId: 'agt_123',
      to: '+14155550100',
      body: 'Hello',
    });

    expect(result.direction).toBe('outbound');
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.message.sent',
        resourceType: 'message',
      }),
    );
  });

  it('requires an attached SMS-capable number', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    await expect(
      service.sendMessage(context, {
        agentId: 'agt_123',
        to: '+14155550100',
        body: 'Hello',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('does not create outbound message when usage debit fails', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'num_123',
          phoneNumber: '+14155551000',
        }),
      },
      message: {
        create: jest.fn(),
      },
    } as unknown as PrismaService;
    const { service, usage } = createService(prisma);
    jest.spyOn(usage, 'recordSms').mockRejectedValue(new Error('insufficient balance'));

    await expect(
      service.sendMessage(context, {
        agentId: 'agt_123',
        to: '+14155550100',
        body: 'Hello',
      }),
    ).rejects.toThrow('insufficient balance');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('simulates inbound SMS and creates received event', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'num_123',
          phoneNumber: '+14155551000',
        }),
      },
      message: {
        create: jest.fn().mockResolvedValue(
          messageFixture({
            direction: 'inbound',
            status: 'received',
          }),
        ),
      },
    } as unknown as PrismaService;
    const { service, events } = createService(prisma);

    const result = await service.simulateInboundSms(context, {
      agentId: 'agt_123',
      from: '+14155550100',
      body: 'Hi',
    });

    expect(result.direction).toBe('inbound');
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.message.received',
      }),
    );
  });

  it('stores provider failure details from Twilio SMS status callbacks', async () => {
    const prisma = {
      message: {
        findFirst: jest.fn().mockResolvedValue(
          messageFixture({
            provider: 'twilio',
            providerMessageId: 'SM123',
            status: 'sent',
          }),
        ),
        update: jest.fn().mockResolvedValue(
          messageFixture({
            provider: 'twilio',
            providerMessageId: 'SM123',
            status: 'failed',
            providerStatus: 'undelivered',
            providerErrorCode: '30007',
            providerErrorText: 'Carrier violation.',
          }),
        ),
      },
      providerRawEvent: {
        create: jest.fn().mockResolvedValue({ id: 'prevt_123' }),
      },
    } as unknown as PrismaService;
    const { service, events } = createService(prisma);

    const result = await service.receiveProviderSmsStatus({
      provider: 'twilio',
      providerMessageId: 'SM123',
      status: 'undelivered',
      providerErrorCode: '30007',
      providerErrorText: 'Carrier violation.',
      rawPayload: {
        MessageSid: 'SM123',
        MessageStatus: 'undelivered',
        ErrorCode: '30007',
        ErrorMessage: 'Carrier violation.',
      },
    });

    expect(result.message).toMatchObject({
      status: 'failed',
      providerStatus: 'undelivered',
      providerErrorCode: '30007',
      providerErrorText: 'Carrier violation.',
    });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg_123' },
      data: expect.objectContaining({
        status: 'failed',
        providerStatus: 'undelivered',
        providerErrorCode: '30007',
        providerErrorText: 'Carrier violation.',
      }),
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.message.delivery_updated',
        payload: expect.objectContaining({
          providerStatus: 'undelivered',
          providerErrorCode: '30007',
          providerErrorText: 'Carrier violation.',
        }),
      }),
    );
  });
});
