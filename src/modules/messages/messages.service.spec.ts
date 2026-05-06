import type { PrismaService } from '../prisma/prisma.service';
import type { ContactsService } from '../contacts/contacts.service';
import type { ConversationsService } from '../conversations/conversations.service';
import type { EventsService } from '../events/events.service';
import { MockProviderService } from '../providers/mock/mock-provider.service';
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
  const provider = new MockProviderService();

  return {
    service: new MessagesService(prisma, contacts, conversations, events, provider),
    contacts,
    conversations,
    events,
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
        create: jest.fn().mockResolvedValue(messageFixture()),
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
});
