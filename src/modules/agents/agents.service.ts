import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type { CreateAgentInput, UpdateAgentInput } from '../../domain/schemas';
import { PrismaService } from '../prisma/prisma.service';
import { serializeAgent } from './agents.serializer';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAgents(context: RequestContext, limit: number) {
    const agents = await this.prisma.agent.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return list(agents.map(serializeAgent), { limit, nextCursor: null });
  }

  async createAgent(context: RequestContext, input: CreateAgentInput) {
    const agent = await this.prisma.agent.create({
      data: {
        id: createId('agt'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        name: input.name,
        description: input.description,
        mode: input.mode,
        systemPrompt: input.systemPrompt,
        voice: input.voice,
        beginMessage: input.beginMessage,
        transferNumber: input.transferNumber,
        voicemailMessage: input.voicemailMessage,
        webhookUrl: input.webhookUrl,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });

    return serializeAgent(agent);
  }

  async getAgent(context: RequestContext, id: string) {
    const agent = await this.findAgentOrThrow(context, id);
    return serializeAgent(agent);
  }

  async updateAgent(context: RequestContext, id: string, input: UpdateAgentInput) {
    await this.findAgentOrThrow(context, id);

    const agent = await this.prisma.agent.update({
      where: { id },
      data: {
        ...input,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    return serializeAgent(agent);
  }

  async disableAgent(context: RequestContext, id: string) {
    await this.findAgentOrThrow(context, id);

    const agent = await this.prisma.agent.update({
      where: { id },
      data: { status: 'disabled' },
    });

    return serializeAgent(agent);
  }

  async findAgentOrThrow(context: RequestContext, id: string) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        id,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
    });

    if (!agent) {
      throw new ApiException('not_found', 'Agent not found.', 404, { id });
    }

    return agent;
  }

  listVoices() {
    return [
      { id: 'alloy', name: 'Alloy', mode: 'hosted' },
      { id: 'verse', name: 'Verse', mode: 'hosted' },
      { id: 'aria', name: 'Aria', mode: 'hosted' },
    ];
  }
}
