import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { createId } from '../../common/ids';
import type { UsageQueryInput } from '../../domain/schemas';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { centsToUsdDecimal, secondsToBillableMinutes, USAGE_PRICING_CENTS } from './usage-pricing';
import { serializeUsageEvent, serializeUsageRollup } from './usage.serializer';

export interface RecordUsageInput {
  workspaceId: string;
  projectId: string;
  agentId?: string;
  resourceType: string;
  resourceId: string;
  channel: string;
  quantity: number;
  unit: string;
  unitCostCents: number;
  occurredAt?: Date;
}

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) { }

  async recordUsage(input: RecordUsageInput) {
    const totalCents = Math.ceil(input.quantity * input.unitCostCents);

    await this.billing.debitWorkspace(input.workspaceId, totalCents);

    return this.prisma.usageEvent.create({
      data: {
        id: createId('use'),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        agentId: input.agentId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        channel: input.channel,
        quantity: new Decimal(input.quantity),
        unit: input.unit,
        unitCost: new Decimal(centsToUsdDecimal(input.unitCostCents)),
        totalCost: new Decimal(centsToUsdDecimal(totalCents)),
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  }

  recordNumberProvisioned(input: {
    workspaceId: string;
    projectId: string;
    agentId?: string;
    numberId: string;
  }) {
    return this.recordUsage({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      agentId: input.agentId,
      resourceType: 'phone_number',
      resourceId: input.numberId,
      channel: 'number',
      quantity: 1,
      unit: 'number',
      unitCostCents: USAGE_PRICING_CENTS.phoneNumberProvision,
    });
  }

  recordSms(input: {
    workspaceId: string;
    projectId: string;
    agentId: string;
    messageId: string;
    direction: 'inbound' | 'outbound';
  }) {
    return this.recordUsage({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      agentId: input.agentId,
      resourceType: 'message',
      resourceId: input.messageId,
      channel: input.direction === 'outbound' ? 'sms.outbound' : 'sms.inbound',
      quantity: 1,
      unit: 'message',
      unitCostCents:
        input.direction === 'outbound'
          ? USAGE_PRICING_CENTS.outboundSms
          : USAGE_PRICING_CENTS.inboundSms,
    });
  }

  recordVoiceCall(input: {
    workspaceId: string;
    projectId: string;
    agentId: string;
    callId: string;
    durationSeconds: number;
  }) {
    const minutes = secondsToBillableMinutes(input.durationSeconds);

    return this.recordUsage({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      agentId: input.agentId,
      resourceType: 'call',
      resourceId: input.callId,
      channel: 'voice',
      quantity: minutes,
      unit: 'minute',
      unitCostCents: USAGE_PRICING_CENTS.voiceMinute,
    });
  }

  async listUsage(context: RequestContext, input: UsageQueryInput, limit: number) {
    const events = await this.prisma.usageEvent.findMany({
      where: this.createUsageWhere(context, input),
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    return list(events.map(serializeUsageEvent), { limit, nextCursor: null });
  }

  async getDailyUsage(context: RequestContext, input: UsageQueryInput) {
    const events = await this.findUsageForRollup(context, input);
    return list(this.rollup(events, 'day'), { limit: events.length, nextCursor: null });
  }

  async getMonthlyUsage(context: RequestContext, input: UsageQueryInput) {
    const events = await this.findUsageForRollup(context, input);
    return list(this.rollup(events, 'month'), { limit: events.length, nextCursor: null });
  }

  private findUsageForRollup(context: RequestContext, input: UsageQueryInput) {
    return this.prisma.usageEvent.findMany({
      where: this.createUsageWhere(context, input),
      orderBy: { occurredAt: 'asc' },
    });
  }

  private createUsageWhere(context: RequestContext, input: UsageQueryInput): Prisma.UsageEventWhereInput {
    return {
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      agentId: input.agentId,
      channel: input.channel,
      occurredAt: {
        gte: input.from ? new Date(input.from) : undefined,
        lte: input.to ? new Date(input.to) : undefined,
      },
    };
  }

  private rollup(events: Awaited<ReturnType<typeof this.findUsageForRollup>>, period: 'day' | 'month') {
    const buckets = new Map<string, { quantity: Decimal; totalCost: Decimal }>();

    for (const event of events) {
      const key =
        period === 'day'
          ? event.occurredAt.toISOString().slice(0, 10)
          : event.occurredAt.toISOString().slice(0, 7);
      const existing = buckets.get(key) ?? {
        quantity: new Decimal(0),
        totalCost: new Decimal(0),
      };
      buckets.set(key, {
        quantity: existing.quantity.plus(event.quantity),
        totalCost: existing.totalCost.plus(event.totalCost),
      });
    }

    return Array.from(buckets.entries()).map(([periodKey, value]) =>
      serializeUsageRollup({
        period: periodKey,
        quantity: value.quantity.toString(),
        totalCost: value.totalCost.toString(),
      }),
    );
  }
}
