import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../prisma/prisma.service';
import type { BrevoEmailProvider } from './brevo-email.provider';
import { EmailService } from './email.service';

const now = new Date('2026-05-06T00:00:00.000Z');

function deliveryFixture(overrides = {}) {
  return {
    id: 'eml_123',
    workspaceId: 'ws_123',
    recipientEmail: 'new@example.com',
    template: 'workspace_invite',
    subject: 'Join AgentLine Local on AgentLine',
    status: 'queued',
    provider: 'brevo',
    providerMessageId: null,
    idempotencyKey: 'workspace_invite:inv_123:fingerprint',
    metadata: {},
    errorCode: null,
    errorMessage: null,
    sentAt: null,
    failedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('EmailService', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'DASHBOARD_URL') {
        return 'http://localhost:8080';
      }
      return undefined;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs skipped invite email when Brevo is not configured', async () => {
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ name: 'AgentLine Local' }),
      },
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(deliveryFixture(data))),
      },
    } as unknown as PrismaService;
    const brevo = {
      isConfigured: jest.fn().mockReturnValue(false),
      send: jest.fn(),
    } as unknown as BrevoEmailProvider;
    const service = new EmailService(prisma, config, brevo);

    const result = await service.sendWorkspaceInviteEmail({
      workspaceId: 'ws_123',
      inviteId: 'inv_123',
      email: 'new@example.com',
      role: 'developer',
      rawToken: 'inv_raw_token',
    });

    expect(result.status).toBe('skipped');
    expect(brevo.send).not.toHaveBeenCalled();
    expect(prisma.emailDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientEmail: 'new@example.com',
        status: 'skipped',
        errorCode: 'provider_not_configured',
      }),
    });
  });

  it('sends invite email through Brevo and marks delivery sent', async () => {
    const delivery = deliveryFixture();
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ name: 'AgentLine Local' }),
      },
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(delivery),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...delivery, ...data })),
      },
    } as unknown as PrismaService;
    const brevo = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg_123' }),
    } as unknown as BrevoEmailProvider;
    const service = new EmailService(prisma, config, brevo);

    const result = await service.sendWorkspaceInviteEmail({
      workspaceId: 'ws_123',
      inviteId: 'inv_123',
      email: 'new@example.com',
      role: 'admin',
      rawToken: 'inv_raw_token',
    });

    expect(brevo.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        subject: 'Join AgentLine Local on AgentLine',
      }),
    );
    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBe('msg_123');
  });

  it('returns existing delivery for the same invite token idempotency key', async () => {
    const existing = deliveryFixture({ status: 'sent' });
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ name: 'AgentLine Local' }),
      },
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue(existing),
      },
    } as unknown as PrismaService;
    const brevo = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn(),
    } as unknown as BrevoEmailProvider;
    const service = new EmailService(prisma, config, brevo);

    const result = await service.sendWorkspaceInviteEmail({
      workspaceId: 'ws_123',
      inviteId: 'inv_123',
      email: 'new@example.com',
      role: 'admin',
      rawToken: 'inv_raw_token',
    });

    expect(result).toBe(existing);
    expect(brevo.send).not.toHaveBeenCalled();
  });

  it('lists email deliveries for the current workspace', async () => {
    const prisma = {
      emailDelivery: {
        findMany: jest.fn().mockResolvedValue([deliveryFixture({ status: 'sent' })]),
      },
    } as unknown as PrismaService;
    const brevo = {
      isConfigured: jest.fn(),
      send: jest.fn(),
    } as unknown as BrevoEmailProvider;
    const service = new EmailService(prisma, config, brevo);

    const result = await service.listDeliveries(
      { workspaceId: 'ws_123', projectId: 'proj_123' },
      { limit: 20, status: 'sent' },
    );

    expect(prisma.emailDelivery.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws_123',
        status: 'sent',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    expect(result.data).toHaveLength(1);
  });

  it('sends invite accepted email and marks delivery sent', async () => {
    const delivery = deliveryFixture({ template: 'invite_accepted' });
    const prisma = {
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(delivery),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...delivery, ...data })),
      },
    } as unknown as PrismaService;
    const brevo = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg_456' }),
    } as unknown as BrevoEmailProvider;
    const service = new EmailService(prisma, config, brevo);

    const result = await service.sendInviteAcceptedEmail({
      workspaceId: 'ws_123',
      inviteId: 'inv_123',
      email: 'new@example.com',
      role: 'developer',
      workspaceName: 'AgentLine Local',
    });

    expect(brevo.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        subject: 'new@example.com joined AgentLine Local',
      }),
    );
    expect(result.status).toBe('sent');
  });

  it('skips invite accepted email when Brevo is not configured', async () => {
    const delivery = deliveryFixture({ template: 'invite_accepted', status: 'skipped' });
    const prisma = {
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(delivery),
      },
    } as unknown as PrismaService;
    const brevo = {
      isConfigured: jest.fn().mockReturnValue(false),
      send: jest.fn(),
    } as unknown as BrevoEmailProvider;
    const service = new EmailService(prisma, config, brevo);

    const result = await service.sendInviteAcceptedEmail({
      workspaceId: 'ws_123',
      inviteId: 'inv_123',
      email: 'new@example.com',
      role: 'developer',
      workspaceName: 'AgentLine Local',
    });

    expect(result.status).toBe('skipped');
    expect(brevo.send).not.toHaveBeenCalled();
  });

  it('sends invite revoked email and marks delivery sent', async () => {
    const delivery = deliveryFixture({ template: 'invite_revoked' });
    const prisma = {
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(delivery),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...delivery, ...data })),
      },
    } as unknown as PrismaService;
    const brevo = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg_789' }),
    } as unknown as BrevoEmailProvider;
    const service = new EmailService(prisma, config, brevo);

    const result = await service.sendInviteRevokedEmail({
      workspaceId: 'ws_123',
      inviteId: 'inv_123',
      email: 'revoked@example.com',
      workspaceName: 'AgentLine Local',
    });

    expect(brevo.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'revoked@example.com',
        subject: 'Your invite to AgentLine Local was revoked',
      }),
    );
    expect(result.status).toBe('sent');
  });

  it('returns existing delivery for duplicate invite accepted idempotency key', async () => {
    const existing = deliveryFixture({ template: 'invite_accepted', status: 'sent' });
    const prisma = {
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue(existing),
      },
    } as unknown as PrismaService;
    const brevo = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn(),
    } as unknown as BrevoEmailProvider;
    const service = new EmailService(prisma, config, brevo);

    const result = await service.sendInviteAcceptedEmail({
      workspaceId: 'ws_123',
      inviteId: 'inv_123',
      email: 'new@example.com',
      role: 'developer',
      workspaceName: 'AgentLine Local',
    });

    expect(result).toBe(existing);
    expect(brevo.send).not.toHaveBeenCalled();
  });
});
