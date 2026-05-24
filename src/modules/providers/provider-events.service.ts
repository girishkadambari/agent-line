import { Injectable } from '@nestjs/common';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  providerResourceFromCall,
  providerResourceFromMessage,
  serializeProviderEvent,
  serializeProviderEventSummary,
} from './provider-events.serializer';

interface ListProviderEventsInput {
  eventType?: string;
  providerEventId?: string;
}

type ProviderResource = ReturnType<
  typeof providerResourceFromMessage | typeof providerResourceFromCall
>;

@Injectable()
export class ProviderEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProviderEvents(context: RequestContext, limit: number, input: ListProviderEventsInput) {
    const events = await this.prisma.providerRawEvent.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        eventType: input.eventType,
        providerEventId: input.providerEventId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const resources = await this.resolveResources(
      events.map((event) => event.providerEventId).filter(Boolean) as string[],
    );

    return list(
      events.map((event) =>
        serializeProviderEvent(
          event,
          resources.get(this.baseProviderEventId(event.providerEventId)),
        ),
      ),
      { limit, hasMore: false, nextCursor: null },
    );
  }

  async getProviderEventSummary(context: RequestContext) {
    const [events, total, grouped] = await Promise.all([
      this.prisma.providerRawEvent.findMany({
        where: {
          workspaceId: context.workspaceId,
          projectId: context.projectId,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.providerRawEvent.count({
        where: {
          workspaceId: context.workspaceId,
          projectId: context.projectId,
        },
      }),
      this.prisma.providerRawEvent.groupBy({
        by: ['eventType'],
        where: {
          workspaceId: context.workspaceId,
          projectId: context.projectId,
        },
        _count: { _all: true },
      }),
    ]);

    const resources = await this.resolveResources(
      events.map((event) => event.providerEventId).filter(Boolean) as string[],
    );
    const recentErrors = events
      .filter((event) => this.hasProviderError(event.payload))
      .slice(0, 10)
      .map((event) =>
        serializeProviderEvent(
          event,
          resources.get(this.baseProviderEventId(event.providerEventId)),
        ),
      );

    return serializeProviderEventSummary({
      total,
      byEventType: Object.fromEntries(grouped.map((group) => [group.eventType, group._count._all])),
      recentErrors,
    });
  }

  private async resolveResources(providerEventIds: string[]) {
    const baseIds = [
      ...new Set(providerEventIds.map((id) => this.baseProviderEventId(id)).filter(isString)),
    ];
    const [messages, calls] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          providerMessageId: { in: baseIds },
        },
      }),
      this.prisma.call.findMany({
        where: {
          providerCallId: { in: baseIds },
        },
      }),
    ]);

    const resources = new Map<string | null, ProviderResource>();
    for (const message of messages) {
      resources.set(message.providerMessageId, providerResourceFromMessage(message));
    }
    for (const call of calls) {
      resources.set(call.providerCallId, providerResourceFromCall(call));
    }

    return resources;
  }

  private baseProviderEventId(providerEventId: string | null) {
    return providerEventId?.split(':')[0] ?? null;
  }

  private hasProviderError(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    const data = payload as Record<string, unknown>;
    return Boolean(
      data.ErrorCode ||
      data.ErrorMessage ||
      data.ErrorMessageText ||
      ['failed', 'undelivered', 'busy', 'no-answer', 'canceled'].includes(
        String(data.MessageStatus ?? data.SmsStatus ?? data.CallStatus ?? ''),
      ),
    );
  }
}

function isString(value: string | null): value is string {
  return typeof value === 'string' && value.length > 0;
}
