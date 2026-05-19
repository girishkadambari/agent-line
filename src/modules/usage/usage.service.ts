import { Injectable } from '@nestjs/common';
import { Prisma, type UsageEvent } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { createId } from '../../common/ids';
import { VukhoEvent, EventResourceType } from '../../domain/events';
import type { UsageQueryInput } from '../../domain/schemas';
import { BillingRateCardService } from '../billing/billing-rate-card.service';
import { BillingService } from '../billing/billing.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import {
  centsToUsdDecimal,
  secondsToBillableMinutes,
  USAGE_PRICING_VERSION,
  type UsageRateKey,
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
  unitCostCents?: number;
  rateKey?: UsageRateKey;
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
    private readonly rateCards: BillingRateCardService,
    private readonly events: EventsService,
    private readonly webhooks: WebhooksService,
  ) {}

  async recordUsage(input: RecordUsageInput) {
    const rate = input.rateKey ? await this.rateCards.getRate(input.rateKey) : null;
    const unitCostCents = input.unitCostCents ?? rate?.unitCostCents;
    const pricingVersion = rate?.pricingVersion ?? USAGE_PRICING_VERSION;
    const pricingSource = rate?.source ?? 'default';
    const formula = input.calculation?.formula ?? rate?.formula ?? 'ceil(quantity * unitCostCents)';

    if (unitCostCents === undefined) {
      throw new Error('Usage rate is required to record billable usage.');
    }

    const totalCents = Math.ceil(input.quantity * unitCostCents);
    const usageEvent = await this.runUsageTransaction(async (tx) => {
      const db = tx ?? this.prisma;
      const settlementInput = {
        workspaceId: input.workspaceId,
        cents: totalCents,
        occurredAt: input.occurredAt,
      };
      const settlement = tx
        ? await this.billing.settleUsageCharge(settlementInput, tx)
        : await this.billing.settleUsageCharge(settlementInput);

      return db.usageEvent.create({
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
          unitCost: new Decimal(centsToUsdDecimal(unitCostCents)),
          totalCost: new Decimal(centsToUsdDecimal(totalCents)),
          pricingVersion,
          settlementMode: settlement.settlementMode,
          settlementStatus: settlement.settlementStatus,
          allowanceGrantId: settlement.allowanceGrantId,
          calculation: {
            pricingVersion,
            pricingSource,
            rateKey: input.rateKey ?? null,
            formula,
            quantity: input.quantity,
            billableQuantity: input.quantity,
            unit: input.unit,
            unitCostCents,
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
    });
    const shouldReportToStripe =
      input.reportToStripe !== false && usageEvent.settlementMode === 'stripe_meter';

    if (!shouldReportToStripe) {
      await this.emitUsageEvent(VukhoEvent.UsageRecorded, usageEvent);
      return usageEvent;
    }

    const stripeSettlement = await this.billing.reportUsageEventToStripe(usageEvent);

    if (stripeSettlement.status === 'internal_debited') {
      await this.emitUsageEvent(VukhoEvent.UsageRecorded, usageEvent);
      return usageEvent;
    }

    const settledEvent = await this.prisma.usageEvent.update({
      where: { id: usageEvent.id },
      data: {
        settlementStatus: stripeSettlement.status,
        stripeMeterEventId: stripeSettlement.stripeMeterEventId,
      },
    });

    await this.emitUsageEvent(VukhoEvent.UsageRecorded, settledEvent);

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
        this.emitUsageEvent(VukhoEvent.UsageVoided, {
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
        resourceType: EventResourceType.Call,
        resourceId: input.callId,
        channel: 'voice',
      },
    });

    if (!event) {
      return { finalized: false, deltaCents: 0 };
    }

    const quantity = secondsToBillableMinutes(input.durationSeconds);
    const rate = await this.rateCards.getRate('voice_minute');
    const totalCents = quantity * rate.unitCostCents;
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
          pricingVersion: rate.pricingVersion,
          pricingSource: rate.source,
          rateKey: rate.key,
          formula: rate.formula,
          durationSeconds: input.durationSeconds,
          billableQuantity: quantity,
          unit: 'minute',
          unitCostCents: rate.unitCostCents,
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

    await this.emitUsageEvent(VukhoEvent.UsageFinalized, finalizedEvent);

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
      resourceType: EventResourceType.PhoneNumber,
      resourceId: input.numberId,
      channel: 'number',
      quantity: 1,
      unit: 'number',
      rateKey: 'phone_number_provision',
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
      resourceType: EventResourceType.Message,
      resourceId: input.messageId,
      channel: input.direction === 'outbound' ? 'sms.outbound' : 'sms.inbound',
      quantity: 1,
      unit: 'message',
      rateKey: input.direction === 'outbound' ? 'sms_outbound' : 'sms_inbound',
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
      resourceType: EventResourceType.Call,
      resourceId: input.callId,
      channel: 'voice',
      quantity: minutes,
      unit: 'minute',
      rateKey: 'voice_minute',
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
      resourceType: EventResourceType.UsageEvent,
      resourceId: event.id,
      payload: {
        usageEvent: serializeUsageEvent(event),
      },
    });

    await this.webhooks.createDeliveriesForEvent(internalEvent);
  }

  private runUsageTransaction<T>(
    callback: (tx?: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(callback);
    }

    return callback();
  }
}
