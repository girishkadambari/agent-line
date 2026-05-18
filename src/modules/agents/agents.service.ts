import { Injectable } from '@nestjs/common';
import { AgentStatus, Prisma, type Agent } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { VukhoEvent, EventResourceType } from '../../domain/events';
import type { CreateAgentInput, UpdateAgentInput } from '../../domain/schemas';
import { serializeCall } from '../calls/calls.serializer';
import { serializeConversation } from '../conversations/conversations.serializer';
import { serializeMessage } from '../messages/messages.serializer';
import { serializeNumber } from '../numbers/numbers.serializer';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { serializeUsageEvent } from '../usage/usage.serializer';
import { WebhooksService } from '../webhooks/webhooks.service';
import { serializeWebhookDelivery } from '../webhooks/webhooks.serializer';
import { serializeAgent } from './agents.serializer';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly webhooks: WebhooksService,
  ) {}

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

    await this.emitAgentEvent(context, VukhoEvent.AgentCreated, agent);

    return serializeAgent(agent);
  }

  async getAgent(context: RequestContext, id: string) {
    const agent = await this.findAgentOrThrow(context, id);
    return serializeAgent(agent);
  }

  async getAgentSummary(context: RequestContext, id: string) {
    const agent = await this.findAgentOrThrow(context, id);

    const [
      numbers,
      conversations,
      calls,
      messagesCount,
      recentMessages,
      usageEvents,
      webhookDeliveries,
    ] = await Promise.all([
      this.prisma.phoneNumber.findMany({
        where: { workspaceId: context.workspaceId, projectId: context.projectId, agentId: id },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
      this.prisma.conversation.findMany({
        where: { workspaceId: context.workspaceId, projectId: context.projectId, agentId: id },
        orderBy: { lastActivityAt: 'desc' },
        take: 25,
      }),
      this.prisma.call.findMany({
        where: { workspaceId: context.workspaceId, projectId: context.projectId, agentId: id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.message.count({
        where: { workspaceId: context.workspaceId, projectId: context.projectId, agentId: id },
      }),
      this.prisma.message.findMany({
        where: { workspaceId: context.workspaceId, projectId: context.projectId, agentId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.usageEvent.findMany({
        where: { workspaceId: context.workspaceId, projectId: context.projectId, agentId: id },
        orderBy: { occurredAt: 'desc' },
        take: 25,
      }),
      this.prisma.webhookDelivery.findMany({
        where: {
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          eventType: {
            in: [
              VukhoEvent.MessageSent,
              VukhoEvent.MessageReceived,
              VukhoEvent.MessageDeliveryUpdated,
              VukhoEvent.CallStarted,
              VukhoEvent.CallCompleted,
              VukhoEvent.CallEnded,
              VukhoEvent.CallFailed,
              VukhoEvent.CallStatusUpdated,
              VukhoEvent.CallTransferred,
              VukhoEvent.CallTranscriptUpdated,
            ],
          },
          OR: [
            { payload: { path: ['data', 'agentId'], equals: id } },
            { payload: { path: ['data', 'payload', 'agentId'], equals: id } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    const failedWebhookDeliveries = webhookDeliveries.filter((delivery) =>
      ['failed', 'retrying', 'exhausted'].includes(delivery.status),
    ).length;
    const providerResourceById = this.buildProviderResourceMap(calls, recentMessages);
    const providerEvents =
      providerResourceById.size > 0
        ? await this.prisma.providerRawEvent.findMany({
            where: {
              workspaceId: context.workspaceId,
              projectId: context.projectId,
              OR: Array.from(providerResourceById.keys()).map((providerId) => ({
                providerEventId: { startsWith: providerId },
              })),
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        : [];
    const providerIssues = this.buildProviderIssues(providerEvents, providerResourceById);
    const totalUsageCost = usageEvents.reduce(
      (total, event) => total.plus(event.totalCost),
      new Decimal(0),
    );

    return {
      agent: serializeAgent(agent),
      counts: {
        numbers: numbers.length,
        activeNumbers: numbers.filter((number) => number.status === 'active').length,
        conversations: conversations.length,
        messages: messagesCount,
        calls: calls.length,
        failedWebhookDeliveries,
        providerIssues: providerIssues.length,
      },
      numbers: numbers.map(serializeNumber),
      recentConversations: conversations.map(serializeConversation),
      recentCalls: calls.map(serializeCall),
      recentMessages: recentMessages.map(serializeMessage),
      recentUsageEvents: usageEvents.map(serializeUsageEvent),
      recentWebhookDeliveries: webhookDeliveries.map(serializeWebhookDelivery),
      providerIssues,
      timeline: this.buildAgentTimeline({
        calls,
        messages: recentMessages,
        usageEvents,
        webhookDeliveries,
        providerIssues,
      }),
      usage: {
        eventCount: usageEvents.length,
        totalCost: totalUsageCost.toString(),
      },
      lastActivityAt: this.resolveLastActivityAt(
        agent.updatedAt,
        numbers,
        conversations,
        calls,
        recentMessages,
      ),
    };
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

    await this.emitAgentEvent(context, VukhoEvent.AgentUpdated, agent);

    return serializeAgent(agent);
  }

  async disableAgent(context: RequestContext, id: string) {
    await this.findAgentOrThrow(context, id);

    const agent = await this.prisma.agent.update({
      where: { id },
      data: { status: 'disabled' },
    });

    await this.emitAgentEvent(context, VukhoEvent.AgentDisabled, agent);

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

  private async emitAgentEvent(context: RequestContext, type: string, agent: Agent) {
    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type,
      resourceType: EventResourceType.Agent,
      resourceId: agent.id,
      payload: this.buildAgentEventPayload(agent),
    });
    await this.webhooks.createDeliveriesForEvent(event);
  }

  private buildAgentEventPayload(
    agent: Pick<
      Agent,
      | 'id'
      | 'name'
      | 'description'
      | 'mode'
      | 'status'
      | 'voice'
      | 'webhookUrl'
      | 'createdAt'
      | 'updatedAt'
    >,
  ) {
    return {
      agentId: agent.id,
      name: agent.name,
      description: agent.description,
      mode: agent.mode,
      status: agent.status as AgentStatus,
      voice: agent.voice,
      webhookUrl: agent.webhookUrl,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }

  private resolveLastActivityAt(
    fallback: Date,
    numbers: Array<{ updatedAt: Date }>,
    conversations: Array<{ lastActivityAt: Date }>,
    calls: Array<{ updatedAt: Date }>,
    messages: Array<{ updatedAt: Date }>,
  ) {
    const latest = [
      fallback,
      ...numbers.map((number) => number.updatedAt),
      ...conversations.map((conversation) => conversation.lastActivityAt),
      ...calls.map((call) => call.updatedAt),
      ...messages.map((message) => message.updatedAt),
    ].sort((left, right) => right.getTime() - left.getTime())[0];

    return latest.toISOString();
  }

  private buildAgentTimeline(input: {
    calls: Array<{
      id: string;
      direction: string;
      status: string;
      outcome: string | null;
      durationSeconds: number | null;
      updatedAt: Date;
      createdAt: Date;
    }>;
    messages: Array<{
      id: string;
      direction: string;
      status: string;
      createdAt: Date;
    }>;
    usageEvents: Array<{
      id: string;
      resourceType: string;
      resourceId: string;
      channel: string;
      totalCost: Decimal;
      occurredAt: Date;
    }>;
    webhookDeliveries: Array<{
      id: string;
      eventType: string;
      status: string;
      lastStatusCode: number | null;
      lastError: string | null;
      updatedAt: Date;
      createdAt: Date;
    }>;
    providerIssues: Array<{
      id: string;
      provider: string;
      eventType: string;
      status: string | null;
      resourceType: string;
      resourceId: string;
      code: string | null;
      message: string | null;
      occurredAt: string;
    }>;
  }) {
    const items = [
      ...input.calls.map((call) => ({
        id: `call:${call.id}`,
        type: 'call',
        title: `${call.direction} call ${call.status}`,
        status: call.status,
        resourceId: call.id,
        occurredAt: call.updatedAt.toISOString(),
        metadata: {
          outcome: call.outcome,
          durationSeconds: call.durationSeconds,
        },
      })),
      ...input.messages.map((message) => ({
        id: `message:${message.id}`,
        type: 'message',
        title: `${message.direction} message ${message.status}`,
        status: message.status,
        resourceId: message.id,
        occurredAt: message.createdAt.toISOString(),
        metadata: {
          direction: message.direction,
        },
      })),
      ...input.usageEvents.map((event) => ({
        id: `usage:${event.id}`,
        type: 'usage',
        title: `${event.channel} usage charged`,
        status: 'recorded',
        resourceId: event.resourceId,
        occurredAt: event.occurredAt.toISOString(),
        metadata: {
          resourceType: event.resourceType,
          totalCost: event.totalCost.toString(),
        },
      })),
      ...input.webhookDeliveries.map((delivery) => ({
        id: `webhook:${delivery.id}`,
        type: 'webhook',
        title: `${delivery.eventType} webhook ${delivery.status}`,
        status: delivery.status,
        resourceId: delivery.id,
        occurredAt: delivery.updatedAt.toISOString(),
        metadata: {
          eventType: delivery.eventType,
          lastStatusCode: delivery.lastStatusCode,
          lastError: delivery.lastError,
        },
      })),
      ...input.providerIssues.map((issue) => ({
        id: `provider_issue:${issue.id}`,
        type: 'provider_issue',
        title: `${issue.provider} ${issue.resourceType} issue`,
        status: issue.status ?? 'failed',
        resourceId: issue.resourceId,
        occurredAt: issue.occurredAt,
        metadata: {
          eventType: issue.eventType,
          code: issue.code,
          message: issue.message,
        },
      })),
    ];

    return items
      .sort(
        (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
      )
      .slice(0, 30);
  }

  private buildProviderResourceMap(
    calls: Array<{ id: string; providerCallId: string | null }>,
    messages: Array<{ id: string; providerMessageId: string | null }>,
  ) {
    const resources = new Map<
      string,
      {
        resourceType: typeof EventResourceType.Call | typeof EventResourceType.Message;
        resourceId: string;
      }
    >();

    for (const call of calls) {
      if (call.providerCallId) {
        resources.set(call.providerCallId, {
          resourceType: EventResourceType.Call,
          resourceId: call.id,
        });
      }
    }
    for (const message of messages) {
      if (message.providerMessageId) {
        resources.set(message.providerMessageId, {
          resourceType: EventResourceType.Message,
          resourceId: message.id,
        });
      }
    }

    return resources;
  }

  private buildProviderIssues(
    events: Array<{
      id: string;
      provider: string;
      providerEventId: string | null;
      eventType: string;
      payload: Prisma.JsonValue;
      createdAt: Date;
    }>,
    resources: Map<
      string,
      {
        resourceType: typeof EventResourceType.Call | typeof EventResourceType.Message;
        resourceId: string;
      }
    >,
  ) {
    return events
      .map((event) => {
        const resource = this.findProviderEventResource(event.providerEventId, resources);
        if (!resource) {
          return null;
        }

        const status =
          this.getJsonString(event.payload, 'MessageStatus') ??
          this.getJsonString(event.payload, 'SmsStatus') ??
          this.getJsonString(event.payload, 'CallStatus');
        const code =
          this.getJsonString(event.payload, 'ErrorCode') ??
          this.getJsonString(event.payload, 'Errorcode') ??
          this.getJsonString(event.payload, 'error_code');
        const message =
          this.getJsonString(event.payload, 'ErrorMessage') ??
          this.getJsonString(event.payload, 'ErrorMessageText') ??
          this.getJsonString(event.payload, 'error_message');

        if (!this.isProviderIssueStatus(status) && !code && !message) {
          return null;
        }

        return {
          id: event.id,
          provider: event.provider,
          providerEventId: event.providerEventId,
          eventType: event.eventType,
          status,
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
          code,
          message: message ?? this.providerIssueMessage(status, code),
          occurredAt: event.createdAt.toISOString(),
        };
      })
      .filter((issue): issue is NonNullable<typeof issue> => Boolean(issue));
  }

  private findProviderEventResource(
    providerEventId: string | null,
    resources: Map<
      string,
      {
        resourceType: typeof EventResourceType.Call | typeof EventResourceType.Message;
        resourceId: string;
      }
    >,
  ) {
    if (!providerEventId) {
      return null;
    }

    for (const [providerId, resource] of resources.entries()) {
      if (providerEventId.startsWith(providerId)) {
        return resource;
      }
    }

    return null;
  }

  private getJsonString(payload: Prisma.JsonValue, key: string) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }

    return null;
  }

  private isProviderIssueStatus(status: string | null) {
    return ['failed', 'undelivered', 'busy', 'no-answer', 'no_answer', 'canceled'].includes(
      status ?? '',
    );
  }

  private providerIssueMessage(status: string | null, code: string | null) {
    if (code) {
      return `Provider returned error code ${code}.`;
    }
    if (status) {
      return `Provider reported ${status}.`;
    }
    return 'Provider reported an issue.';
  }
}
