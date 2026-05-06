import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { WorkspacesService } from './workspaces.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

const now = new Date('2026-05-06T00:00:00.000Z');

function memberFixture(overrides = {}) {
  return {
    id: 'mem_123',
    workspaceId: context.workspaceId,
    userId: 'usr_123',
    role: 'owner',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function memberWithUserFixture(overrides = {}) {
  return {
    ...memberFixture(),
    user: {
      id: 'usr_123',
      email: 'owner@example.com',
      name: 'Owner',
      avatarUrl: null,
      googleId: null,
      createdAt: now,
      updatedAt: now,
    },
    ...overrides,
  };
}

describe('WorkspacesService', () => {
  const audit = {
    record: jest.fn().mockResolvedValue({}),
  } as unknown as AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prevents removing the last active owner', async () => {
    const prisma = {
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue(memberFixture()),
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;
    const service = new WorkspacesService(prisma, audit);

    await expect(service.removeMember(context, 'mem_123')).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('updates member role and records an audit event', async () => {
    const prisma = {
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue(memberFixture({ role: 'developer' })),
        update: jest.fn().mockResolvedValue(memberWithUserFixture({ role: 'admin' })),
      },
    } as unknown as PrismaService;
    const service = new WorkspacesService(prisma, audit);

    const result = await service.updateMember(context, 'mem_123', { role: 'admin' });

    expect(result.role).toBe('admin');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: context.workspaceId,
        actorApiKeyId: context.apiKeyId,
        action: 'member.role_updated',
      }),
    );
  });

  it('creates invite with raw token returned once and hashed token stored', async () => {
    const prisma = {
      workspaceInvite: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...data,
            status: 'pending',
            invitedById: null,
            acceptedById: null,
            acceptedAt: null,
            revokedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      },
    } as unknown as PrismaService;
    const service = new WorkspacesService(prisma, audit);

    const result = await service.createInvite(context, {
      email: 'new@example.com',
      role: 'developer',
    });

    expect(result.rawToken).toMatch(/^inv_/);
    expect(prisma.workspaceInvite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'new@example.com',
        role: 'developer',
        tokenHash: expect.not.stringMatching(/^inv_/),
      }),
    });
  });
});
