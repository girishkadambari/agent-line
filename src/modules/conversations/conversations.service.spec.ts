import type { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from './conversations.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

const now = new Date('2026-05-06T00:00:00.000Z');

function conversationFixture(overrides = {}) {
  return {
    id: 'conv_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    contactId: 'ctc_123',
    channel: 'sms',
    status: 'active',
    lastActivityAt: now,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ConversationsService', () => {
  it('reuses existing SMS conversation and updates last activity', async () => {
    const prisma = {
      conversation: {
        findFirst: jest.fn().mockResolvedValue(conversationFixture()),
        update: jest.fn().mockResolvedValue(conversationFixture()),
      },
    } as unknown as PrismaService;
    const service = new ConversationsService(prisma);

    await service.findOrCreateSmsConversation(context, 'agt_123', 'ctc_123');

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv_123' },
      data: { lastActivityAt: expect.any(Date) },
    });
  });

  it('creates conversation when missing', async () => {
    const prisma = {
      conversation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(conversationFixture()),
      },
    } as unknown as PrismaService;
    const service = new ConversationsService(prisma);

    await service.findOrCreateSmsConversation(context, 'agt_123', 'ctc_123');

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: 'agt_123',
        contactId: 'ctc_123',
        channel: 'sms',
      }),
    });
  });

  it('creates voice conversation when missing', async () => {
    const prisma = {
      conversation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(conversationFixture({ channel: 'voice' })),
      },
    } as unknown as PrismaService;
    const service = new ConversationsService(prisma);

    await service.findOrCreateVoiceConversation(context, 'agt_123', 'ctc_123');

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'voice',
      }),
    });
  });
});
