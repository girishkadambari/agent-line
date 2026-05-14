import type { PrismaService } from '../prisma/prisma.service';
import { MockProviderService } from '../providers/mock/mock-provider.service';
import type { UsageService } from '../usage/usage.service';
import { NumbersService } from './numbers.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

const now = new Date('2026-05-06T00:00:00.000Z');

function createService(prisma: PrismaService) {
  const usage = {
    recordNumberProvisioned: jest.fn().mockResolvedValue({ id: 'use_123' }),
    voidUsageForFailedOperation: jest.fn().mockResolvedValue({ voided: true, refundedCents: 100 }),
  } as unknown as UsageService;
  const events = {
    create: jest.fn().mockResolvedValue({ id: 'evt_123' }),
  };
  const webhooks = {
    createDeliveriesForEvent: jest.fn().mockResolvedValue([]),
  };

  return {
    service: new NumbersService(
      prisma,
      new MockProviderService(),
      usage,
      events as never,
      webhooks as never,
    ),
    usage,
    events,
    webhooks,
  };
}

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
        create: jest.fn().mockResolvedValue(numberFixture({ status: 'provisioning' })),
        update: jest.fn().mockResolvedValue(numberFixture()),
      },
    } as unknown as PrismaService;
    const { service, usage, events } = createService(prisma);

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
        status: 'provisioning',
        provider: 'mock',
      }),
    });
    expect(result.id).toBe('num_123');
    const createdNumberId = (prisma.phoneNumber.create as jest.Mock).mock.calls[0][0].data.id;
    expect(usage.recordNumberProvisioned).toHaveBeenCalledWith({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      agentId: 'agt_123',
      numberId: createdNumberId,
    });
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.number.attached',
        resourceType: 'phone_number',
      }),
    );
  });

  it('does not create number when usage debit fails', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        create: jest.fn(),
      },
    } as unknown as PrismaService;
    const usage = {
      recordNumberProvisioned: jest.fn().mockRejectedValue(new Error('insufficient balance')),
    } as unknown as UsageService;
    const service = new NumbersService(
      prisma,
      new MockProviderService(),
      usage,
      {} as never,
      {} as never,
    );

    await expect(
      service.provisionNumber(context, {
        agentId: 'agt_123',
        country: 'US',
        areaCode: '415',
        capabilities: ['sms', 'voice'],
      }),
    ).rejects.toThrow('insufficient balance');
    expect(prisma.phoneNumber.create).not.toHaveBeenCalled();
  });

  it('imports an existing provider number and updates the local record without billing a new number', async () => {
    const prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'agt_123' }),
      },
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue(numberFixture({ providerNumberId: null })),
        update: jest.fn().mockResolvedValue(
          numberFixture({
            phoneNumber: '+19012316325',
            provider: 'twilio',
            providerNumberId: 'PN123',
          }),
        ),
        create: jest.fn(),
      },
    } as unknown as PrismaService;
    const provider = {
      importNumber: jest.fn().mockResolvedValue({
        provider: 'twilio',
        providerNumberId: 'PN123',
        phoneNumber: '+19012316325',
        country: 'US',
        capabilities: ['sms', 'voice'],
      }),
    } as unknown as MockProviderService;
    const usage = {
      recordNumberProvisioned: jest.fn(),
      voidUsageForFailedOperation: jest.fn(),
    } as unknown as UsageService;
    const service = new NumbersService(
      prisma,
      provider,
      usage,
      { create: jest.fn().mockResolvedValue({ id: 'evt_123' }) } as never,
      { createDeliveriesForEvent: jest.fn().mockResolvedValue([]) } as never,
    );

    const result = await service.importNumber(context, {
      agentId: 'agt_123',
      phoneNumber: '+19012316325',
      country: 'US',
      areaCode: '901',
      capabilities: ['sms', 'voice'],
    });

    expect(provider.importNumber).toHaveBeenCalledWith({
      phoneNumber: '+19012316325',
      capabilities: ['sms', 'voice'],
    });
    expect(prisma.phoneNumber.update).toHaveBeenCalledWith({
      where: { id: 'num_123' },
      data: expect.objectContaining({
        agentId: 'agt_123',
        provider: 'twilio',
        providerNumberId: 'PN123',
        status: 'active',
      }),
    });
    expect(prisma.phoneNumber.create).not.toHaveBeenCalled();
    expect(usage.recordNumberProvisioned).not.toHaveBeenCalled();
    expect(result.phoneNumber).toBe('+19012316325');
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
    const { service } = createService(prisma);

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
    const { service } = createService(prisma);

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
