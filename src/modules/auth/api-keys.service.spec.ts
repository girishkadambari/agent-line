import type { AuditService } from '../audit/audit.service';
import type { EmailService } from '../email/email.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from './api-keys.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_actor',
  userId: 'usr_actor',
};

const now = new Date('2026-05-07T00:00:00.000Z');

function apiKeyFixture(overrides = {}) {
  return {
    id: 'key_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    label: 'Development key',
    prefix: 'sk_test_abc123',
    keyHash: 'hashed-secret',
    status: 'active',
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createService(prisma: PrismaService) {
  const audit = {
    record: jest.fn().mockResolvedValue({ id: 'audit_123' }),
  } as unknown as AuditService;

  const email = {
    sendApiKeySecurityEmail: jest.fn().mockResolvedValue({}),
  } as unknown as EmailService;

  return {
    service: new ApiKeysService(prisma, audit, email),
    audit,
    email,
  };
}

describe('ApiKeysService', () => {
  it('creates API key, returns raw key once, and stores only hash', async () => {
    const prisma = {
      aPIKey: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(
            apiKeyFixture({
              id: data.id,
              label: data.label,
              prefix: data.prefix,
              keyHash: data.keyHash,
            }),
          ),
        ),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@example.com' }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'AgentLine Local' }) },
    } as unknown as PrismaService;
    const { service, audit } = createService(prisma);

    const result = await service.createApiKey(context, { label: 'Development key' });

    expect(result.key).toMatch(/^sk_test_/);
    expect(result).not.toHaveProperty('keyHash');
    expect(prisma.aPIKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        label: 'Development key',
        status: 'active',
      }),
    });
    expect(prisma.aPIKey.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({
        keyHash: result.key,
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api_key.created',
        actorApiKeyId: context.apiKeyId,
        actorUserId: context.userId,
      }),
    );
  });

  it('lists API keys without key hashes', async () => {
    const prisma = {
      aPIKey: {
        findMany: jest.fn().mockResolvedValue([apiKeyFixture()]),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.listApiKeys(context, 50);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('keyHash');
    expect(result.data[0]).not.toHaveProperty('key');
  });

  it('revokes API key instead of deleting it', async () => {
    const prisma = {
      aPIKey: {
        findFirst: jest.fn().mockResolvedValue(apiKeyFixture()),
        update: jest.fn().mockResolvedValue(apiKeyFixture({ status: 'revoked' })),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@example.com' }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'AgentLine Local' }) },
    } as unknown as PrismaService;
    const { service, audit } = createService(prisma);

    const result = await service.revokeApiKey(context, 'key_123');

    expect(result.status).toBe('revoked');
    expect(prisma.aPIKey.update).toHaveBeenCalledWith({
      where: { id: 'key_123' },
      data: { status: 'revoked' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api_key.revoked',
      }),
    );
  });

  it('rotates API key secrets and returns the new raw key once', async () => {
    const existing = apiKeyFixture({ prefix: 'sk_test_old123' });
    const prisma = {
      aPIKey: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(
            apiKeyFixture({
              prefix: data.prefix,
              keyHash: data.keyHash,
              status: data.status,
            }),
          ),
        ),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@example.com' }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'AgentLine Local' }) },
    } as unknown as PrismaService;
    const { service, audit } = createService(prisma);

    const result = await service.rotateApiKey(context, 'key_123');

    expect(result.key).toMatch(/^sk_test_/);
    expect(result.prefix).not.toBe(existing.prefix);
    expect(prisma.aPIKey.update).toHaveBeenCalledWith({
      where: { id: 'key_123' },
      data: expect.objectContaining({
        status: 'active',
        prefix: expect.any(String),
        keyHash: expect.any(String),
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api_key.rotated',
        actorUserId: context.userId,
        metadata: expect.objectContaining({ previousPrefix: existing.prefix }),
      }),
    );
  });

  it('returns not_found outside workspace/project scope', async () => {
    const prisma = {
      aPIKey: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    await expect(service.revokeApiKey(context, 'key_missing')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('sends security email to actor user on API key creation', async () => {
    const prisma = {
      aPIKey: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(
              apiKeyFixture({ id: data.id, prefix: data.prefix, keyHash: data.keyHash }),
            ),
          ),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@example.com' }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'My Workspace' }) },
    } as unknown as PrismaService;
    const { service, email } = createService(prisma);

    await service.createApiKey(context, { label: 'Test key' });

    expect(email.sendApiKeySecurityEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'owner@example.com',
        workspaceName: 'My Workspace',
        action: 'created',
      }),
    );
  });

  it('skips security email when no actor userId (API key auth)', async () => {
    const apiKeyOnlyContext = { ...context, userId: undefined };
    const prisma = {
      aPIKey: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(
              apiKeyFixture({ id: data.id, prefix: data.prefix, keyHash: data.keyHash }),
            ),
          ),
      },
    } as unknown as PrismaService;
    const { service, email } = createService(prisma);

    await service.createApiKey(apiKeyOnlyContext, { label: 'Automated key' });

    expect(email.sendApiKeySecurityEmail).not.toHaveBeenCalled();
  });

  it('sends security email to actor user on API key revoke', async () => {
    const prisma = {
      aPIKey: {
        findFirst: jest.fn().mockResolvedValue(apiKeyFixture()),
        update: jest.fn().mockResolvedValue(apiKeyFixture({ status: 'revoked' })),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@example.com' }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'My Workspace' }) },
    } as unknown as PrismaService;
    const { service, email } = createService(prisma);

    await service.revokeApiKey(context, 'key_123');

    expect(email.sendApiKeySecurityEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'owner@example.com',
        action: 'revoked',
      }),
    );
  });
});
