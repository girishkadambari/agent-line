import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { createId } from '../../common/ids';
import { PrismaService } from '../prisma/prisma.service';
import { serializeAuditEvent } from './audit.serializer';

export interface RecordAuditEventInput {
  workspaceId: string;
  actorUserId?: string;
  actorApiKeyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput) {
    const event = await this.prisma.auditEvent.create({
      data: {
        id: createId('audit'),
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        actorApiKeyId: input.actorApiKeyId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });

    return serializeAuditEvent(event);
  }

  async listForWorkspace(context: RequestContext, limit: number) {
    const events = await this.prisma.auditEvent.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return list(events.map(serializeAuditEvent), { limit, nextCursor: null });
  }
}
