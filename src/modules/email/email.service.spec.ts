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
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...delivery, ...data })),
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

  it('sends billing alerts to workspace billing recipients with idempotency', async () => {
    const delivery = deliveryFixture({
      template: 'billing_low_balance',
      recipientEmail: 'owner@example.com',
    });
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ name: 'AgentLine Local' }),
      },
      workspaceMember: {
        findMany: jest.fn().mockResolvedValue([
          { user: { email: 'owner@example.com' } },
          { user: { email: 'owner@example.com' } },
          { user: { email: 'billing@example.com' } },
        ]),
      },
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(deliveryFixture(data))),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...delivery, ...data })),
      },
    } as unknown as PrismaService;
    const brevo = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg_123' }),
    } as unknown as BrevoEmailProvider;
    const service = new EmailService(prisma, config, brevo);

    const result = await service.sendWorkspaceBillingAlertEmail({
      workspaceId: 'ws_123',
      kind: 'low_balance',
      balanceCents: 250,
      idempotencyScope: 'balance_below_threshold:2026-05-18',
    });

    expect(result).toHaveLength(2);
    expect(brevo.send).toHaveBeenCalledTimes(2);
    expect(prisma.emailDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientEmail: 'owner@example.com',
        template: 'billing_low_balance',
        status: 'queued',
        idempotencyKey:
          'billing_alert:ws_123:low_balance:balance_below_threshold:2026-05-18:owner@example.com',
      }),
    });
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
});
