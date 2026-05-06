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
    });
    expect(result.action).toBe('agent.created');
  });
});
