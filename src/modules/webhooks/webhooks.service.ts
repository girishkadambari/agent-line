import { Injectable } from '@nestjs/common';
import { Prisma, type WebhookEndpoint } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type {
  CreateWebhookInput,
  RetryWebhookDeliveryInput,
  TestWebhookInput,
  UpdateWebhookInput,
} from '../../domain/schemas';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { createWebhookSecret, signWebhookPayload } from './webhook-signature';
import {
  serializeWebhookDelivery,
  serializeWebhookEndpoint,
  serializeWebhookEndpointWithSecret,
} from './webhooks.serializer';

export interface ListWebhookDeliveriesFilters {
  endpointId?: string;
  eventId?: string;
  status?: 'pending' | 'succeeded' | 'failed' | 'retrying' | 'exhausted';
}

export const WEBHOOK_EVENT_CATALOG = [
  {
    group: 'Wildcard',
    events: [
      { name: '*', description: 'Receive every AgentLine event.' },
      { name: 'agent.*', description: 'Receive every agent-scoped event.' },
      { name: 'agent.call.*', description: 'Receive all call lifecycle and transcript events.' },
      { name: 'agent.message.*', description: 'Receive all SMS/message events.' },
      { name: 'agent.number.*', description: 'Receive all phone number lifecycle events.' },
      { name: 'agent.conversation.*', description: 'Receive all conversation lifecycle events.' },
      { name: 'agent.contact.*', description: 'Receive all contact lifecycle events.' },
      { name: 'agent.usage.*', description: 'Receive all usage, cost, and settlement events.' },
    ],
  },
  {
    group: 'Agents',
    events: [
      { name: 'agent.created', description: 'An agent was created.' },
      { name: 'agent.updated', description: 'An agent configuration changed.' },
      { name: 'agent.disabled', description: 'An agent was disabled.' },
    ],
  },
  {
    group: 'Numbers',
    events: [
      { name: 'agent.number.provisioned', description: 'A provider-backed number became active.' },
      { name: 'agent.number.imported', description: 'An existing provider number was imported.' },
      { name: 'agent.number.attached', description: 'A number was attached to an agent.' },
      { name: 'agent.number.detached', description: 'A number was detached from an agent.' },
      { name: 'agent.number.released', description: 'A number was released.' },
      { name: 'agent.number.failed', description: 'A number provisioning attempt failed.' },
    ],
  },
  {
    group: 'Messages',
    events: [
      { name: 'agent.message.sent', description: 'An outbound SMS was accepted by the provider.' },
      { name: 'agent.message.received', description: 'An inbound SMS was received.' },
      {
        name: 'agent.message.delivery_updated',
        description: 'A provider delivery status changed.',
      },
    ],
  },
  {
    group: 'Calls',
    events: [
      { name: 'agent.call.started', description: 'A call entered active handling.' },
      {
        name: 'agent.call.status_updated',
        description: 'A non-terminal provider call status changed.',
      },
      {
        name: 'agent.call.transcript_updated',
        description: 'A call transcript turn was captured.',
      },
      { name: 'agent.call.completed', description: 'A call completed successfully.' },
      { name: 'agent.call.failed', description: 'A call failed.' },
      { name: 'agent.call.ended', description: 'A call reached a terminal non-completed state.' },
      { name: 'agent.call.transferred', description: 'A call was transferred.' },
    ],
  },
  {
    group: 'Conversations',
    events: [
      {
        name: 'agent.conversation.created',
        description: 'A new SMS or voice conversation started.',
      },
      {
        name: 'agent.conversation.updated',
        description: 'A conversation status or metadata changed.',
      },
    ],
  },
  {
    group: 'Contacts',
    events: [
      { name: 'agent.contact.created', description: 'A contact was created from a phone number.' },
      { name: 'agent.contact.updated', description: 'A contact profile changed.' },
    ],
  },
  {
    group: 'Usage And Billing',
    events: [
      {
        name: 'agent.usage.recorded',
        description: 'A billable usage event was recorded with cost evidence.',
      },
      {
        name: 'agent.usage.finalized',
        description: 'A previously estimated usage event was finalized.',
      },
      {
        name: 'agent.usage.voided',
        description: 'A usage event was voided and credited back.',
      },
    ],
  },
  {
    group: 'Testing',
    events: [{ name: 'webhook.test', description: 'A signed test delivery.' }],
  },
];

@Injectable()
export class WebhooksService {
  private readonly deliveryTimeoutMs = 5000;
  private readonly maxDeliveryAttempts = 5;
  private readonly retryBackoffSeconds = [60, 300, 900, 3600, 10800];

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async listEndpoints(context: RequestContext, limit: number) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return list(endpoints.map(serializeWebhookEndpoint), { limit, nextCursor: null });
  }

  listEventCatalog() {
    return WEBHOOK_EVENT_CATALOG;
  }

  async createEndpoint(context: RequestContext, input: CreateWebhookInput) {
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        id: createId('wh'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        url: input.url,
        events: input.events,
        secret: createWebhookSecret(),
        status: 'active',
      },
    });

    return serializeWebhookEndpointWithSecret(endpoint);
  }

  async updateEndpoint(context: RequestContext, id: string, input: UpdateWebhookInput) {
    await this.findEndpointOrThrow(context, id);
    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        url: input.url,
        events: input.events,
        status: input.status,
      },
    });

    return serializeWebhookEndpoint(endpoint);
  }

  async disableEndpoint(context: RequestContext, id: string) {
    await this.findEndpointOrThrow(context, id);
    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { status: 'disabled' },
    });

    return serializeWebhookEndpoint(endpoint);
  }

  async createTestDelivery(context: RequestContext, id: string, input: TestWebhookInput) {
    const endpoint = await this.findEndpointOrThrow(context, id);

    if (endpoint.status !== 'active') {
      throw new ApiException('conflict', 'Webhook endpoint is not active.', 409, { id });
    }

    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type: 'webhook.test',
      resourceType: 'webhook_endpoint',
      resourceId: endpoint.id,
      payload: { endpointId: endpoint.id },
    });
    const payload = this.createPayload(event);
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        id: createId('whdel'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: event.type,
        payload: payload as Prisma.InputJsonValue,
        status: 'pending',
        attemptCount: 0,
      },
    });

    const delivered = input.simulateFailure
      ? await this.recordDeliveryOutcome({
          deliveryId: delivery.id,
          attemptCount: 1,
          statusCode: 500,
          error: 'Simulated webhook delivery failure.',
        })
      : await this.deliver(endpoint, delivery.id, payload);

    return {
      delivery: serializeWebhookDelivery(delivered),
      headers: signWebhookPayload(endpoint.secret, payload),
    };
  }

  async createDeliveriesForEvent(input: {
    workspaceId: string;
    projectId: string;
    id: string;
    type: string;
    resourceType?: string | null;
    resourceId?: string | null;
    createdAt?: string;
    payload: unknown;
  }) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        status: 'active',
      },
    });
    const matchingEndpoints = endpoints.filter((endpoint) =>
      endpoint.events.some((pattern) => this.matchesEventPattern(pattern, input.type)),
    );
    const payload = this.createPayload(input);

    const deliveries = await Promise.all(
      matchingEndpoints.map(async (endpoint) => {
        const delivery = await this.prisma.webhookDelivery.create({
          data: {
            id: createId('whdel'),
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            endpointId: endpoint.id,
            eventId: input.id,
            eventType: input.type,
            payload: payload as Prisma.InputJsonValue,
            status: 'pending',
            attemptCount: 0,
          },
        });

        return this.deliver(endpoint, delivery.id, payload);
      }),
    );

    return deliveries.map(serializeWebhookDelivery);
  }

  async listDeliveries(
    context: RequestContext,
    limit: number,
    filters: ListWebhookDeliveriesFilters,
  ) {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        endpointId: filters.endpointId,
        eventId: filters.eventId,
        status: filters.status,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return list(deliveries.map(serializeWebhookDelivery), { limit, nextCursor: null });
  }

  async retryDelivery(context: RequestContext, id: string, input: RetryWebhookDeliveryInput) {
    const existing = await this.findDeliveryOrThrow(context, id);

    if (!['failed', 'retrying', 'pending'].includes(existing.status)) {
      throw new ApiException('conflict', 'Webhook delivery is not retryable.', 409, { id });
    }

    if (input.exhaust) {
      const delivery = await this.prisma.webhookDelivery.update({
        where: { id },
        data: {
          status: 'exhausted',
          lastError: existing.lastError ?? 'Webhook delivery was manually exhausted.',
          nextAttemptAt: null,
        },
      });

      return serializeWebhookDelivery(delivery);
    }

    return this.replayDelivery(context, id, { retryOnly: true });
  }

  async replayDelivery(context: RequestContext, id: string, options: { retryOnly?: boolean } = {}) {
    const delivery = await this.findDeliveryWithEndpointOrThrow(context, id);

    if (delivery.endpoint.status !== 'active') {
      throw new ApiException('conflict', 'Webhook endpoint is not active.', 409, {
        id: delivery.endpoint.id,
      });
    }

    if (options.retryOnly && !['failed', 'retrying', 'pending'].includes(delivery.status)) {
      throw new ApiException('conflict', 'Webhook delivery is not retryable.', 409, { id });
    }

    if (delivery.status === 'exhausted') {
      throw new ApiException('conflict', 'Webhook delivery is exhausted.', 409, { id });
    }

    const result = await this.deliver(
      delivery.endpoint,
      delivery.id,
      delivery.payload as Record<string, unknown>,
    );
    return serializeWebhookDelivery(result);
  }

  async processDueDeliveries(context: RequestContext, limit: number) {
    const now = new Date();
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        status: { in: ['pending', 'failed', 'retrying'] },
        endpoint: { status: 'active' },
        OR: [
          { nextAttemptAt: { lte: now } },
          { nextAttemptAt: null, status: { in: ['pending', 'retrying'] } },
        ],
      },
      include: { endpoint: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const processed = await Promise.all(
      deliveries.map((delivery) =>
        this.deliver(delivery.endpoint, delivery.id, delivery.payload as Record<string, unknown>),
      ),
    );

    return list(processed.map(serializeWebhookDelivery), { limit, nextCursor: null });
  }

  async exhaustDelivery(context: RequestContext, id: string) {
    await this.findDeliveryOrThrow(context, id);
    const delivery = await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'exhausted',
        nextAttemptAt: null,
      },
    });

    return serializeWebhookDelivery(delivery);
  }

  private createPayload(event: {
    id: string;
    type: string;
    workspaceId: string;
    projectId: string;
    resourceType?: string | null;
    resourceId?: string | null;
    createdAt?: string;
    payload: Record<string, unknown> | unknown;
  }) {
    return {
      id: event.id,
      type: event.type,
      apiVersion: '2026-05-13',
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      createdAt: event.createdAt ?? new Date().toISOString(),
      resource: {
        type: event.resourceType ?? null,
        id: event.resourceId ?? null,
      },
      data: event.payload,
    };
  }

  private matchesEventPattern(pattern: string, eventType: string) {
    if (pattern === '*' || pattern === eventType) {
      return true;
    }

    if (!pattern.endsWith('.*')) {
      return false;
    }

    return eventType.startsWith(pattern.slice(0, -1));
  }

  private nextRetryDate(attemptCount: number) {
    const index = Math.min(Math.max(attemptCount - 1, 0), this.retryBackoffSeconds.length - 1);
    return new Date(Date.now() + this.retryBackoffSeconds[index] * 1000);
  }

  private async deliver(
    endpoint: Pick<WebhookEndpoint, 'id' | 'url' | 'secret'>,
    deliveryId: string,
    payload: Record<string, unknown>,
  ) {
    const claimed = await this.claimDelivery(deliveryId);

    if (!claimed) {
      const current = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
      if (!current) {
        throw new ApiException('not_found', 'Webhook delivery not found.', 404, { id: deliveryId });
      }

      return current;
    }

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...signWebhookPayload(endpoint.secret, payload),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.deliveryTimeoutMs),
      });

      return this.recordDeliveryOutcome({
        deliveryId,
        attemptCount: claimed.attemptCount,
        statusCode: response.status,
        error: response.ok ? null : `Webhook endpoint returned HTTP ${response.status}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook delivery failed.';
      return this.recordDeliveryOutcome({
        deliveryId,
        attemptCount: claimed.attemptCount,
        statusCode: null,
        error: message,
      });
    }
  }

  private async claimDelivery(deliveryId: string) {
    const current = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });

    if (!current || ['succeeded', 'exhausted'].includes(current.status)) {
      return null;
    }

    if (current.attemptCount >= this.maxDeliveryAttempts) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'exhausted',
          nextAttemptAt: null,
          lastError: current.lastError ?? 'Webhook delivery exhausted retry attempts.',
        },
      });
      return null;
    }

    const claimed = await this.prisma.webhookDelivery.updateMany({
      where: {
        id: deliveryId,
        status: { in: ['pending', 'failed', 'retrying'] },
        attemptCount: current.attemptCount,
      },
      data: {
        status: 'retrying',
        attemptCount: { increment: 1 },
        nextAttemptAt: null,
      },
    });

    if (claimed.count !== 1) {
      return null;
    }

    return this.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  }

  private async recordDeliveryOutcome(input: {
    deliveryId: string;
    attemptCount: number;
    statusCode: number | null;
    error: string | null;
  }) {
    const succeeded = input.error === null && input.statusCode !== null && input.statusCode < 400;
    const exhausted = !succeeded && input.attemptCount >= this.maxDeliveryAttempts;

    return this.prisma.webhookDelivery.update({
      where: { id: input.deliveryId },
      data: {
        status: succeeded ? 'succeeded' : exhausted ? 'exhausted' : 'failed',
        attemptCount: input.attemptCount,
        lastStatusCode: input.statusCode,
        lastError: succeeded
          ? null
          : (input.error ?? `Webhook endpoint returned HTTP ${input.statusCode}.`),
        nextAttemptAt: succeeded || exhausted ? null : this.nextRetryDate(input.attemptCount),
      },
    });
  }

  private async findEndpointOrThrow(context: RequestContext, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: {
        id,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
    });

    if (!endpoint) {
      throw new ApiException('not_found', 'Webhook endpoint not found.', 404, { id });
    }

    return endpoint;
  }

  private async findDeliveryOrThrow(context: RequestContext, id: string) {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: {
        id,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
    });

    if (!delivery) {
      throw new ApiException('not_found', 'Webhook delivery not found.', 404, { id });
    }

    return delivery;
  }

  private async findDeliveryWithEndpointOrThrow(context: RequestContext, id: string) {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: {
        id,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
      include: { endpoint: true },
    });

    if (!delivery) {
      throw new ApiException('not_found', 'Webhook delivery not found.', 404, { id });
    }

    return delivery;
  }
}
