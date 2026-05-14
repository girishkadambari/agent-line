import { Injectable } from '@nestjs/common';
import { Prisma, type UsageEvent } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { createId } from '../../common/ids';
import type { UsageQueryInput } from '../../domain/schemas';
import { BillingService } from '../billing/billing.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import {
  centsToUsdDecimal,
  secondsToBillableMinutes,
  USAGE_PRICING_CENTS,
  USAGE_PRICING_VERSION,
} from './usage-pricing';
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
  evidence?: Record<string, unknown>;
  calculation?: Record<string, unknown>;
  reportToStripe?: boolean;
}

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly events: EventsService,
    private readonly webhooks: WebhooksService,
  ) {}

  async recordUsage(input: RecordUsageInput) {
    const totalCents = Math.ceil(input.quantity * input.unitCostCents);
    const settlement = await this.billing.settleUsageCharge({
      workspaceId: input.workspaceId,
      cents: totalCents,
      occurredAt: input.occurredAt,
    });
    const shouldReportToStripe =
      input.reportToStripe !== false && settlement.settlementMode === 'stripe_meter';

    const usageEvent = await this.prisma.usageEvent.create({
      data: {
        id: createId('use'),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        agentId: input.agentId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        channel: input.channel,
        quantity: new Decimal(input.quantity),
        billableQuantity: new Decimal(input.quantity),
        unit: input.unit,
        unitCost: new Decimal(centsToUsdDecimal(input.unitCostCents)),
        totalCost: new Decimal(centsToUsdDecimal(totalCents)),
        pricingVersion: USAGE_PRICING_VERSION,
        settlementMode: settlement.settlementMode,
        settlementStatus: settlement.settlementStatus,
        allowanceGrantId: settlement.allowanceGrantId,
        calculation: {
          pricingVersion: USAGE_PRICING_VERSION,
          formula: 'ceil(quantity * unitCostCents)',
          quantity: input.quantity,
          billableQuantity: input.quantity,
          unit: input.unit,
          unitCostCents: input.unitCostCents,
          totalCents,
          settlementMode: settlement.settlementMode,
          ...input.calculation,
        } as Prisma.InputJsonValue,
        evidence: {
          detectedAt: (input.occurredAt ?? new Date()).toISOString(),
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          channel: input.channel,
          settlement: settlement.evidence,
          ...input.evidence,
        } as Prisma.InputJsonValue,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });

    if (!shouldReportToStripe) {
      await this.emitUsageEvent('agent.usage.recorded', usageEvent);
      return usageEvent;
    }

    const stripeSettlement = await this.billing.reportUsageEventToStripe(usageEvent);

    if (stripeSettlement.status === 'internal_debited') {
      await this.emitUsageEvent('agent.usage.recorded', usageEvent);
      return usageEvent;
    }

    const settledEvent = await this.prisma.usageEvent.update({
      where: { id: usageEvent.id },
      data: {
        settlementStatus: stripeSettlement.status,
        stripeMeterEventId: stripeSettlement.stripeMeterEventId,
      },
    });

    await this.emitUsageEvent('agent.usage.recorded', settledEvent);

    return settledEvent;
  }

  async voidUsageForFailedOperation(input: {
    workspaceId: string;
    resourceType: string;
    resourceId: string;
  }) {
    const events = await this.prisma.usageEvent.findMany({
      where: {
        workspaceId: input.workspaceId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
    });

    if (events.length === 0) {
      return { voided: false, refundedCents: 0 };
    }

    const refundedCents = events.reduce(
      (sum, event) => sum + Math.ceil(new Decimal(event.totalCost).mul(100).toNumber()),
      0,
    );

    await this.prisma.usageEvent.updateMany({
      where: {
        workspaceId: input.workspaceId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
      data: { settlementStatus: 'voided' },
    });
    await Promise.all(
      events.map((event) =>
        this.billing.adjustSettledUsageCharge(event, -this.usageEventCents(event)),
      ),
    );

    await Promise.all(
      events.map((event) =>
        this.emitUsageEvent('agent.usage.voided', {
          ...event,
          settlementStatus: 'voided',
        }),
      ),
    );

    return { voided: true, refundedCents };
  }

  async finalizeVoiceCall(input: { workspaceId: string; callId: string; durationSeconds: number }) {
    const event = await this.prisma.usageEvent.findFirst({
      where: {
        workspaceId: input.workspaceId,
        resourceType: 'call',
        resourceId: input.callId,
        channel: 'voice',
      },
    });

    if (!event) {
      return { finalized: false, deltaCents: 0 };
    }

    const quantity = secondsToBillableMinutes(input.durationSeconds);
    const totalCents = quantity * USAGE_PRICING_CENTS.voiceMinute;
    const currentCents = Math.ceil(new Decimal(event.totalCost).mul(100).toNumber());
    const deltaCents = totalCents - currentCents;
    const settlement = await this.billing.adjustSettledUsageCharge(event, deltaCents);

    const updated = await this.prisma.usageEvent.update({
      where: { id: event.id },
      data: {
        quantity: new Decimal(quantity),
        billableQuantity: new Decimal(quantity),
        totalCost: new Decimal(centsToUsdDecimal(totalCents)),
        settlementMode: settlement.settlementMode,
        allowanceGrantId: settlement.allowanceGrantId,
        calculation: {
          pricingVersion: USAGE_PRICING_VERSION,
          formula: 'ceil(durationSeconds / 60) * voiceMinuteCents',
          durationSeconds: input.durationSeconds,
          billableQuantity: quantity,
          unit: 'minute',
          unitCostCents: USAGE_PRICING_CENTS.voiceMinute,
          totalCents,
          previousTotalCents: currentCents,
          settlementDeltaCents: deltaCents,
          settlementMode: settlement.settlementMode,
        },
        evidence: {
          ...(typeof event.evidence === 'object' && event.evidence !== null ? event.evidence : {}),
          finalSettlement: settlement.evidence,
        } as Prisma.InputJsonValue,
      },
    });

    const stripeSettlement =
      updated.settlementMode === 'stripe_meter'
        ? await this.billing.reportUsageEventToStripe(updated)
        : { status: 'internal_debited' as const };
    let finalizedEvent = updated;
    if (stripeSettlement.status !== 'internal_debited') {
      finalizedEvent = await this.prisma.usageEvent.update({
        where: { id: event.id },
        data: {
          settlementStatus: stripeSettlement.status,
          stripeMeterEventId: stripeSettlement.stripeMeterEventId,
        },
      });
    }

    await this.emitUsageEvent('agent.usage.finalized', finalizedEvent);

    return { finalized: true, deltaCents };
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
      evidence: {
        source: 'number.provisioned',
        numberId: input.numberId,
      },
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
      evidence: {
        source: input.direction === 'outbound' ? 'sms.outbound' : 'sms.inbound',
        messageId: input.messageId,
        direction: input.direction,
      },
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
      calculation: {
        formula: 'ceil(durationSeconds / 60) * voiceMinuteCents',
        durationSeconds: input.durationSeconds,
        billableQuantity: minutes,
      },
      evidence: {
        source: 'voice.call.preauthorization',
        callId: input.callId,
        preauthorizedDurationSeconds: input.durationSeconds,
      },
      reportToStripe: false,
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

  private createUsageWhere(
    context: RequestContext,
    input: UsageQueryInput,
  ): Prisma.UsageEventWhereInput {
    return {
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      agentId: input.agentId,
      channel: input.channel,
      settlementStatus: { not: 'voided' },
      occurredAt: {
        gte: input.from ? new Date(input.from) : undefined,
        lte: input.to ? new Date(input.to) : undefined,
      },
    };
  }

  private rollup(
    events: Awaited<ReturnType<typeof this.findUsageForRollup>>,
    period: 'day' | 'month',
  ) {
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

  private usageEventCents(event: UsageEvent) {
    return Math.ceil(new Decimal(event.totalCost).mul(100).toNumber());
  }

  private async emitUsageEvent(type: string, event: UsageEvent) {
    const internalEvent = await this.events.create({
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      type,
      resourceType: 'usage_event',
      resourceId: event.id,
      payload: {
        usageEvent: serializeUsageEvent(event),
      },
    });

    await this.webhooks.createDeliveriesForEvent(internalEvent);
  }
}
