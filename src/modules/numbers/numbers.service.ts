import { Inject, Injectable } from '@nestjs/common';
import type { PhoneNumber } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { AgentLineEvent, AuditAction, EventResourceType } from '../../domain/events';
import type { TelecomProvider } from '../../domain/provider';
import type { CreateNumberInput, ImportNumberInput, UpdateNumberInput } from '../../domain/schemas';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { TELECOM_PROVIDER } from '../providers/providers.constants';
import { UsageService } from '../usage/usage.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AuditService } from '../audit/audit.service';
import { serializeNumber } from './numbers.serializer';

@Injectable()
export class NumbersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TELECOM_PROVIDER) private readonly telecomProvider: TelecomProvider,
    private readonly usage: UsageService,
    private readonly events: EventsService,
    private readonly webhooks: WebhooksService,
    private readonly audit: AuditService,
  ) {}

  async listNumbers(context: RequestContext, limit: number) {
    const numbers = await this.prisma.phoneNumber.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return list(numbers.map(serializeNumber), { limit, nextCursor: null });
  }

  async provisionNumber(context: RequestContext, input: CreateNumberInput) {
    if (input.agentId) {
      await this.assertAgentExists(context, input.agentId);
    }

    const numberId = createId('num');
    await this.usage.recordNumberProvisioned({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      agentId: input.agentId,
      numberId,
    });

    let providerNumberId: string | undefined;
    try {
      await this.prisma.phoneNumber.create({
        data: {
          id: numberId,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          agentId: input.agentId,
          phoneNumber: `pending:${numberId}`,
          country: input.country,
          areaCode: input.areaCode,
          capabilities: input.capabilities,
          status: 'provisioning',
          provider: 'mock',
        },
      });

      const provisioned = await this.telecomProvider.provisionNumber({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        country: input.country,
        areaCode: input.areaCode,
        capabilities: input.capabilities,
      });
      providerNumberId = provisioned.providerNumberId;

      const number = await this.prisma.phoneNumber.update({
        where: { id: numberId },
        data: {
          phoneNumber: provisioned.phoneNumber,
          country: provisioned.country,
          areaCode: provisioned.areaCode,
          capabilities: provisioned.capabilities,
          status: 'active',
          provider: provisioned.provider,
          providerNumberId: provisioned.providerNumberId,
        },
      });
      await this.emitNumberEvent(context, AgentLineEvent.NumberProvisioned, number);
      if (input.agentId) {
        await this.emitNumberEvent(context, AgentLineEvent.NumberAttached, number);
      }
      await this.recordNumberAudit(context, AuditAction.NumberProvisioned, number, {
        attachedAgentId: input.agentId ?? null,
      });
      return serializeNumber(number);
    } catch (error) {
      if (providerNumberId) {
        await this.telecomProvider.releaseNumber({ providerNumberId }).catch(() => undefined);
      }
      const failedNumber = await this.prisma.phoneNumber
        .update({
          where: { id: numberId },
          data: { status: 'failed' },
        })
        .catch(() => undefined);
      if (failedNumber) {
        await this.emitNumberEvent(context, AgentLineEvent.NumberFailed, failedNumber, {
          failureReason: error instanceof Error ? error.message : 'Number provisioning failed.',
        });
      }
      await this.usage.voidUsageForFailedOperation({
        workspaceId: context.workspaceId,
        resourceType: EventResourceType.PhoneNumber,
        resourceId: numberId,
      });
      throw error;
    }
  }

  async attachNewNumberToAgent(context: RequestContext, agentId: string, input: CreateNumberInput) {
    await this.assertAgentExists(context, agentId);
    return this.provisionNumber(context, { ...input, agentId });
  }

  async importNumber(context: RequestContext, input: ImportNumberInput) {
    if (input.agentId) {
      await this.assertAgentExists(context, input.agentId);
    }

    const imported = await this.telecomProvider.importNumber({
      phoneNumber: input.phoneNumber,
      capabilities: input.capabilities,
    });

    const existing = await this.prisma.phoneNumber.findFirst({
      where: {
        workspaceId: context.workspaceId,
        phoneNumber: imported.phoneNumber,
      },
    });

    if (existing) {
      const updated = await this.prisma.phoneNumber.update({
        where: { id: existing.id },
        data: {
          projectId: context.projectId,
          agentId: input.agentId,
          country: imported.country,
          areaCode: input.areaCode,
          capabilities: imported.capabilities,
          status: 'active',
          provider: imported.provider,
          providerNumberId: imported.providerNumberId,
        },
      });
      await this.emitNumberEvent(context, AgentLineEvent.NumberImported, updated);
      if (input.agentId) {
        await this.emitNumberEvent(context, AgentLineEvent.NumberAttached, updated);
      }
      await this.recordNumberAudit(context, AuditAction.NumberImported, updated, {
        attachedAgentId: input.agentId ?? null,
        existingRecord: true,
      });
      return serializeNumber(updated);
    }

    const number = await this.prisma.phoneNumber.create({
      data: {
        id: createId('num'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: input.agentId,
        phoneNumber: imported.phoneNumber,
        country: imported.country,
        areaCode: input.areaCode,
        capabilities: imported.capabilities,
        status: 'active',
        provider: imported.provider,
        providerNumberId: imported.providerNumberId,
      },
    });

    await this.emitNumberEvent(context, AgentLineEvent.NumberImported, number);
    if (input.agentId) {
      await this.emitNumberEvent(context, AgentLineEvent.NumberAttached, number);
    }
    await this.recordNumberAudit(context, AuditAction.NumberImported, number, {
      attachedAgentId: input.agentId ?? null,
      existingRecord: false,
    });

    return serializeNumber(number);
  }

  async getNumber(context: RequestContext, id: string) {
    const number = await this.findNumberOrThrow(context, id);
    return serializeNumber(number);
  }

  async updateNumber(context: RequestContext, id: string, input: UpdateNumberInput) {
    const existing = await this.findNumberOrThrow(context, id);

    if (input.agentId) {
      await this.assertAgentExists(context, input.agentId);
    }

    const number = await this.prisma.phoneNumber.update({
      where: { id },
      data: {
        agentId: input.agentId,
      },
    });

    if (existing.agentId !== number.agentId) {
      await this.emitNumberEvent(
        context,
        number.agentId ? AgentLineEvent.NumberAttached : AgentLineEvent.NumberDetached,
        number,
        { previousAgentId: existing.agentId },
      );
      await this.recordNumberAudit(
        context,
        number.agentId ? AuditAction.NumberAttached : AuditAction.NumberDetached,
        number,
        { previousAgentId: existing.agentId },
      );
    }

    return serializeNumber(number);
  }

  async detachNumberFromAgent(context: RequestContext, agentId: string, numberId: string) {
    await this.assertAgentExists(context, agentId);

    const number = await this.prisma.phoneNumber.findFirst({
      where: {
        id: numberId,
        agentId,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
    });

    if (!number) {
      throw new ApiException('not_found', 'Attached phone number not found.', 404, {
        agentId,
        numberId,
      });
    }

    const updated = await this.prisma.phoneNumber.update({
      where: { id: numberId },
      data: { agentId: null },
    });

    await this.emitNumberEvent(context, AgentLineEvent.NumberDetached, updated, {
      previousAgentId: agentId,
    });
    await this.recordNumberAudit(context, AuditAction.NumberDetached, updated, {
      previousAgentId: agentId,
    });

    return serializeNumber(updated);
  }

  async releaseNumber(context: RequestContext, id: string) {
    const number = await this.findNumberOrThrow(context, id);

    if (number.status === 'released') {
      return serializeNumber(number);
    }

    if (number.providerNumberId) {
      await this.telecomProvider.releaseNumber({ providerNumberId: number.providerNumberId });
    }

    const released = await this.prisma.phoneNumber.update({
      where: { id },
      data: {
        status: 'released',
        agentId: null,
      },
    });

    await this.emitNumberEvent(context, AgentLineEvent.NumberReleased, released, {
      previousAgentId: number.agentId,
    });
    await this.recordNumberAudit(context, AuditAction.NumberReleased, released, {
      previousAgentId: number.agentId,
    });

    return serializeNumber(released);
  }

  private async recordNumberAudit(
    context: RequestContext,
    action: string,
    number: PhoneNumber,
    metadata: Record<string, unknown> = {},
  ) {
    await this.audit.record({
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorApiKeyId: context.apiKeyId,
      action,
      resourceType: EventResourceType.PhoneNumber,
      resourceId: number.id,
      metadata: {
        projectId: context.projectId,
        phoneNumber: number.phoneNumber,
        provider: number.provider,
        status: number.status,
        ...metadata,
      },
    });
  }

  private async emitNumberEvent(
    context: RequestContext,
    type: string,
    number: PhoneNumber,
    extra: Record<string, unknown> = {},
  ) {
    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type,
      resourceType: EventResourceType.PhoneNumber,
      resourceId: number.id,
      payload: {
        numberId: number.id,
        agentId: number.agentId,
        phoneNumber: number.phoneNumber,
        country: number.country,
        areaCode: number.areaCode,
        capabilities: number.capabilities,
        status: number.status,
        provider: number.provider,
        createdAt: number.createdAt.toISOString(),
        updatedAt: number.updatedAt.toISOString(),
        ...extra,
      },
    });
    await this.webhooks.createDeliveriesForEvent(event);
  }

  private async findNumberOrThrow(context: RequestContext, id: string) {
    const number = await this.prisma.phoneNumber.findFirst({
      where: {
        id,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
    });

    if (!number) {
      throw new ApiException('not_found', 'Phone number not found.', 404, { id });
    }

    return number;
  }

  private async assertAgentExists(context: RequestContext, agentId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        id: agentId,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
      select: { id: true },
    });

    if (!agent) {
      throw new ApiException('not_found', 'Agent not found.', 404, { agentId });
    }
  }
}
