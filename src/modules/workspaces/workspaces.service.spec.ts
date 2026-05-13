import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { EmailService } from '../email/email.service';
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
  const email = {
    sendWorkspaceInviteEmail: jest.fn().mockResolvedValue({}),
  } as unknown as EmailService;

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
    const service = new WorkspacesService(prisma, audit, email);

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
    const service = new WorkspacesService(prisma, audit, email);

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
    const service = new WorkspacesService(prisma, audit, email);

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
    expect(email.sendWorkspaceInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: context.workspaceId,
        inviteId: result.id,
        email: 'new@example.com',
        role: 'developer',
        rawToken: result.rawToken,
      }),
    );
  });

  it('creates a user-owned workspace with default project and billing balance', async () => {
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (callback) =>
        callback({
          workspace: {
            create: jest.fn().mockResolvedValue({
              id: 'ws_new',
              name: 'New workspace',
              createdAt: now,
              updatedAt: now,
              projects: [
                {
                  id: 'proj_new',
                  workspaceId: 'ws_new',
                  name: 'Default project',
                  environment: 'test',
                  createdAt: now,
                  updatedAt: now,
                },
              ],
            }),
          },
          workspaceMember: {
            create: jest.fn().mockResolvedValue(memberFixture({ workspaceId: 'ws_new' })),
          },
        }),
      ),
    } as unknown as PrismaService;
    const service = new WorkspacesService(prisma, audit, email);

    const result = await service.createWorkspaceForUser('usr_123', { name: 'New workspace' });

    expect(result.id).toBe('ws_new');
    expect(result.projects).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_new',
        actorUserId: 'usr_123',
        action: 'workspace.created',
      }),
    );
  });

  it('accepts a pending invite for the signed-in email', async () => {
    const invite = {
      id: 'inv_123',
      workspaceId: 'ws_123',
      email: 'new@example.com',
      role: 'developer',
      status: 'pending',
      tokenHash: 'hash',
      invitedById: null,
      acceptedById: null,
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const prisma = {
      workspaceInvite: {
        findFirst: jest.fn().mockResolvedValue(invite),
      },
      $transaction: jest.fn().mockImplementation(async (callback) =>
        callback({
          workspaceMember: {
            upsert: jest.fn().mockResolvedValue(memberFixture({ role: 'developer' })),
          },
          workspaceInvite: {
            update: jest.fn().mockResolvedValue({
              ...invite,
              status: 'accepted',
              acceptedById: 'usr_123',
              acceptedAt: now,
            }),
          },
        }),
      ),
    } as unknown as PrismaService;
    const service = new WorkspacesService(prisma, audit, email);

    const result = await service.acceptInvite('usr_123', 'new@example.com', { token: 'inv_raw_token_123456' });

    expect(result.status).toBe('accepted');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invite.accepted',
        actorUserId: 'usr_123',
      }),
    );
  });
});
