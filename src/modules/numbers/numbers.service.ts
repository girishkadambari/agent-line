import { Injectable } from '@nestjs/common';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type { CreateNumberInput, UpdateNumberInput } from '../../domain/schemas';
import { MockProviderService } from '../providers/mock/mock-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { serializeNumber } from './numbers.serializer';

@Injectable()
export class NumbersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mockProvider: MockProviderService,
  ) { }

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

    const provisioned = await this.mockProvider.provisionNumber({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      country: input.country,
      areaCode: input.areaCode,
      capabilities: input.capabilities,
    });

    const number = await this.prisma.phoneNumber.create({
      data: {
        id: createId('num'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agentId: input.agentId,
        phoneNumber: provisioned.phoneNumber,
        country: provisioned.country,
        areaCode: provisioned.areaCode,
        capabilities: provisioned.capabilities,
        status: 'active',
        provider: provisioned.provider,
        providerNumberId: provisioned.providerNumberId,
      },
    });

    return serializeNumber(number);
  }

  async attachNewNumberToAgent(context: RequestContext, agentId: string, input: CreateNumberInput) {
    await this.assertAgentExists(context, agentId);
    return this.provisionNumber(context, { ...input, agentId });
  }

  async getNumber(context: RequestContext, id: string) {
    const number = await this.findNumberOrThrow(context, id);
    return serializeNumber(number);
  }

  async updateNumber(context: RequestContext, id: string, input: UpdateNumberInput) {
    await this.findNumberOrThrow(context, id);

    if (input.agentId) {
      await this.assertAgentExists(context, input.agentId);
    }

    const number = await this.prisma.phoneNumber.update({
      where: { id },
      data: {
        agentId: input.agentId,
      },
    });

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

    return serializeNumber(updated);
  }

  async releaseNumber(context: RequestContext, id: string) {
    const number = await this.findNumberOrThrow(context, id);

    if (number.status === 'released') {
      return serializeNumber(number);
    }

    if (number.providerNumberId) {
      await this.mockProvider.releaseNumber({ providerNumberId: number.providerNumberId });
    }

    const released = await this.prisma.phoneNumber.update({
      where: { id },
      data: {
        status: 'released',
        agentId: null,
      },
    });

    return serializeNumber(released);
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
