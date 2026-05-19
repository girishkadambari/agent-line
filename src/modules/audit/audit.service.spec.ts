import type { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

const now = new Date('2026-05-06T00:00:00.000Z');

describe('AuditService', () => {
  it('records append-only audit events with actor context', async () => {
    const prisma = {
      auditEvent: {
        create: jest.fn().mockResolvedValue({
          id: 'audit_123',
          workspaceId: 'ws_123',
          actorUserId: null,
          actorApiKeyId: 'key_123',
          action: 'agent.created',
          resourceType: 'agent',
          resourceId: 'agt_123',
          metadata: { name: 'Support Agent' },
          ipAddress: null,
          userAgent: null,
          createdAt: now,
          actorUser: null,
        }),
      },
      aPIKey: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'key_123',
          label: 'Local development key',
          prefix: 'sk_test',
        }),
      },
    } as unknown as PrismaService;
    const service = new AuditService(prisma);

    const result = await service.record({
      workspaceId: 'ws_123',
      actorApiKeyId: 'key_123',
      action: 'agent.created',
      resourceType: 'agent',
      resourceId: 'agt_123',
      metadata: { name: 'Support Agent' },
    });

    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws_123',
        actorApiKeyId: 'key_123',
        action: 'agent.created',
        resourceType: 'agent',
        resourceId: 'agt_123',
      }),
      include: {
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    expect(result.action).toBe('agent.created');
    expect(result.actor).toEqual({
      type: 'api_key',
      name: null,
      email: null,
      apiKeyLabel: 'Local development key',
      apiKeyPrefix: 'sk_test',
      displayName: 'Local development key',
      detail: 'API key prefix sk_test',
    });
    expect(result.display).toEqual({
      actionLabel: 'Agent Created',
      actorLabel: 'Local development key',
      actorDetail: 'API key prefix sk_test',
      category: 'agent',
      resourceLabel: 'Agent',
      summary: 'Name: Support Agent',
    });
  });
});
