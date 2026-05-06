import type { PrismaService } from '../prisma/prisma.service';
import { MockProviderService } from '../providers/mock/mock-provider.service';
import { NumbersService } from './numbers.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

const now = new Date('2026-05-06T00:00:00.000Z');

function numberFixture(overrides = {}) {
  return {
    id: 'num_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    phoneNumber: '+14155551000',
    country: 'US',
    areaCode: '415',
    capabilities: ['sms', 'voice'],
    status: 'active',
    provider: 'mock',
    providerNumberId: 'mock_num_proj_123_415',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('NumbersService', () => {
  it('provisions a mock number and attaches it to an agent', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        create: jest.fn().mockResolvedValue(numberFixture()),
      },
    } as unknown as PrismaService;
    const service = new NumbersService(prisma, new MockProviderService());

    const result = await service.provisionNumber(context, {
      agentId: 'agt_123',
      country: 'US',
      areaCode: '415',
      capabilities: ['sms', 'voice'],
    });

    expect(prisma.phoneNumber.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: 'agt_123',
        phoneNumber: '+14155551000',
        status: 'active',
        provider: 'mock',
      }),
    });
    expect(result.id).toBe('num_123');
  });

  it('detaches an attached number from an agent', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue(numberFixture()),
        update: jest.fn().mockResolvedValue(numberFixture({ agentId: null })),
      },
    } as unknown as PrismaService;
    const service = new NumbersService(prisma, new MockProviderService());

    const result = await service.detachNumberFromAgent(context, 'agt_123', 'num_123');

    expect(prisma.phoneNumber.update).toHaveBeenCalledWith({
      where: { id: 'num_123' },
      data: { agentId: null },
    });
    expect(result.agentId).toBeNull();
  });

  it('marks a number released instead of deleting history', async () => {
    const prisma = {
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue(numberFixture()),
        update: jest.fn().mockResolvedValue(numberFixture({ status: 'released', agentId: null })),
      },
    } as unknown as PrismaService;
    const service = new NumbersService(prisma, new MockProviderService());

    const result = await service.releaseNumber(context, 'num_123');

    expect(prisma.phoneNumber.update).toHaveBeenCalledWith({
      where: { id: 'num_123' },
      data: {
        status: 'released',
        agentId: null,
      },
    });
    expect(result.status).toBe('released');
  });
});
