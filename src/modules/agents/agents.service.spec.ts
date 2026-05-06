import { createAgentSchema } from '../../domain/schemas';
import type { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from './agents.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

const now = new Date('2026-05-06T00:00:00.000Z');

function agentFixture(overrides = {}) {
  return {
    id: 'agt_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    name: 'Support Agent',
    description: null,
    mode: 'webhook',
    status: 'active',
    systemPrompt: null,
    voice: null,
    beginMessage: null,
    transferNumber: null,
    voicemailMessage: null,
    webhookUrl: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('AgentsService', () => {
  it('creates an agent scoped to the request context', async () => {
    const prisma = {
      agent: {
        create: jest.fn().mockResolvedValue(agentFixture()),
      },
    } as unknown as PrismaService;
    const service = new AgentsService(prisma);

    const result = await service.createAgent(context, {
      name: 'Support Agent',
      mode: 'webhook',
      metadata: {},
    });

    expect(prisma.agent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        name: 'Support Agent',
        mode: 'webhook',
      }),
    });
    expect(result.id).toBe('agt_123');
  });

  it('lists agents with documented pagination shape', async () => {
    const prisma = {
      agent: {
        findMany: jest.fn().mockResolvedValue([agentFixture()]),
      },
    } as unknown as PrismaService;
    const service = new AgentsService(prisma);

    await expect(service.listAgents(context, 10)).resolves.toMatchObject({
      data: [{ id: 'agt_123' }],
      pagination: { limit: 10, nextCursor: null },
    });
  });

  it('disables an agent instead of deleting history', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue(agentFixture()),
        update: jest.fn().mockResolvedValue(agentFixture({ status: 'disabled' })),
      },
    } as unknown as PrismaService;
    const service = new AgentsService(prisma);

    const result = await service.disableAgent(context, 'agt_123');

    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'agt_123' },
      data: { status: 'disabled' },
    });
    expect(result.status).toBe('disabled');
  });

  it('rejects invalid agent mode at validation boundary', () => {
    expect(() =>
      createAgentSchema.parse({
        name: 'Bad Agent',
        mode: 'invalid',
      }),
    ).toThrow();
  });
});
