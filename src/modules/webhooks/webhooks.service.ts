import { Injectable } from '@nestjs/common';
import { Prisma, type WebhookEndpoint } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import {
  AgentLineEvent,
  AgentLineEventPattern,
  AuditAction,
  EventResourceType,
} from '../../domain/events';
import type {
  CreateWebhookInput,
  RetryWebhookDeliveryInput,
  TestWebhookInput,
  UpdateWebhookInput,
} from '../../domain/schemas';
import { AuditService } from '../audit/audit.service';
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
      { name: AgentLineEventPattern.All, description: 'Receive every AgentLine event.' },
      { name: AgentLineEventPattern.Agents, description: 'Receive every agent-scoped event.' },
      {
        name: AgentLineEventPattern.Calls,
        description: 'Receive all call lifecycle and transcript events.',
      },
      { name: AgentLineEventPattern.Messages, description: 'Receive all SMS/message events.' },
      {
        name: AgentLineEventPattern.Numbers,
        description: 'Receive all phone number lifecycle events.',
      },
      {
        name: AgentLineEventPattern.Conversations,
        description: 'Receive all conversation lifecycle events.',
      },
      {
        name: AgentLineEventPattern.Contacts,
        description: 'Receive all contact lifecycle events.',
      },
      {
        name: AgentLineEventPattern.Usage,
        description: 'Receive all usage, cost, and settlement events.',
      },
    ],
  },
  {
    group: 'Agents',
    events: [
      { name: AgentLineEvent.AgentCreated, description: 'An agent was created.' },
      { name: AgentLineEvent.AgentUpdated, description: 'An agent configuration changed.' },
      { name: AgentLineEvent.AgentDisabled, description: 'An agent was disabled.' },
    ],
  },
  {
    group: 'Numbers',
    events: [
      {
        name: AgentLineEvent.NumberProvisioned,
        description: 'A provider-backed number became active.',
      },
      {
        name: AgentLineEvent.NumberImported,
        description: 'An existing provider number was imported.',
      },
      { name: AgentLineEvent.NumberAttached, description: 'A number was attached to an agent.' },
      { name: AgentLineEvent.NumberDetached, description: 'A number was detached from an agent.' },
      { name: AgentLineEvent.NumberReleased, description: 'A number was released.' },
      { name: AgentLineEvent.NumberFailed, description: 'A number provisioning attempt failed.' },
    ],
  },
  {
    group: 'Messages',
    events: [
      {
        name: AgentLineEvent.MessageSent,
        description: 'An outbound SMS was accepted by the provider.',
      },
      { name: AgentLineEvent.MessageReceived, description: 'An inbound SMS was received.' },
      {
        name: AgentLineEvent.MessageDeliveryUpdated,
        description: 'A provider delivery status changed.',
      },
    ],
  },
  {
    group: 'Calls',
    events: [
      { name: AgentLineEvent.CallStarted, description: 'A call entered active handling.' },
      {
        name: AgentLineEvent.CallStatusUpdated,
        description: 'A non-terminal provider call status changed.',
      },
      {
        name: AgentLineEvent.CallTranscriptUpdated,
        description: 'A call transcript turn was captured.',
      },
      { name: AgentLineEvent.CallCompleted, description: 'A call completed successfully.' },
      { name: AgentLineEvent.CallFailed, description: 'A call failed.' },
      {
        name: AgentLineEvent.CallEnded,
        description: 'A call reached a terminal non-completed state.',
      },
      { name: AgentLineEvent.CallTransferred, description: 'A call was transferred.' },
    ],
  },
  {
    group: 'Conversations',
    events: [
      {
        name: AgentLineEvent.ConversationCreated,
        description: 'A new SMS or voice conversation started.',
      },
      {
        name: AgentLineEvent.ConversationUpdated,
        description: 'A conversation status or metadata changed.',
      },
    ],
  },
  {
    group: 'Contacts',
    events: [
      {
        name: AgentLineEvent.ContactCreated,
        description: 'A contact was created from a phone number.',
      },
      { name: AgentLineEvent.ContactUpdated, description: 'A contact profile changed.' },
    ],
  },
  {
    group: 'Usage And Billing',
    events: [
      {
        name: AgentLineEvent.UsageRecorded,
        description: 'A billable usage event was recorded with cost evidence.',
      },
      {
        name: AgentLineEvent.UsageFinalized,
        description: 'A previously estimated usage event was finalized.',
      },
      {
        name: AgentLineEvent.UsageVoided,
        description: 'A usage event was voided and credited back.',
      },
    ],
  },
  {
    group: 'Testing',
    events: [{ name: AgentLineEvent.WebhookTest, description: 'A signed test delivery.' }],
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
    private readonly audit: AuditService,
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

    await this.recordWebhookAudit(context, AuditAction.WebhookEndpointCreated, endpoint, {
      eventCount: endpoint.events.length,
    });

    return serializeWebhookEndpointWithSecret(endpoint);
  }

  async updateEndpoint(context: RequestContext, id: string, input: UpdateWebhookInput) {
    const existing = await this.findEndpointOrThrow(context, id);
    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        url: input.url,
        events: input.events,
        status: input.status,
      },
    });

    await this.recordWebhookAudit(context, AuditAction.WebhookEndpointUpdated, endpoint, {
      previousUrl: existing.url,
      previousEvents: existing.events,
      previousStatus: existing.status,
    });

    return serializeWebhookEndpoint(endpoint);
  }

  async disableEndpoint(context: RequestContext, id: string) {
    const existing = await this.findEndpointOrThrow(context, id);
    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { status: 'disabled' },
    });

    await this.recordWebhookAudit(context, AuditAction.WebhookEndpointDisabled, endpoint, {
      previousStatus: existing.status,
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
      type: AgentLineEvent.WebhookTest,
      resourceType: EventResourceType.WebhookEndpoint,
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

    await this.recordWebhookAudit(context, AuditAction.WebhookDeliveryTested, endpoint, {
      deliveryId: delivered.id,
      deliveryStatus: delivered.status,
      simulateFailure: input.simulateFailure ?? false,
    });

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

      await this.audit.record({
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        actorApiKeyId: context.apiKeyId,
        action: AuditAction.WebhookDeliveryExhausted,
        resourceType: EventResourceType.WebhookDelivery,
        resourceId: delivery.id,
        metadata: {
          projectId: context.projectId,
          endpointId: existing.endpointId,
          eventId: existing.eventId,
          eventType: existing.eventType,
          previousStatus: existing.status,
        },
      });

      return serializeWebhookDelivery(delivery);
    }

    const delivery = await this.replayDelivery(context, id, { retryOnly: true });
    await this.audit.record({
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorApiKeyId: context.apiKeyId,
      action: AuditAction.WebhookDeliveryRetried,
      resourceType: EventResourceType.WebhookDelivery,
      resourceId: id,
      metadata: {
        projectId: context.projectId,
        endpointId: existing.endpointId,
        eventId: existing.eventId,
        eventType: existing.eventType,
        status: delivery.status,
      },
    });
    return delivery;
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
    const existing = await this.findDeliveryOrThrow(context, id);
    const delivery = await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'exhausted',
        nextAttemptAt: null,
      },
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorApiKeyId: context.apiKeyId,
      action: AuditAction.WebhookDeliveryExhausted,
      resourceType: EventResourceType.WebhookDelivery,
      resourceId: delivery.id,
      metadata: {
        projectId: context.projectId,
        endpointId: existing.endpointId,
        eventId: existing.eventId,
        eventType: existing.eventType,
        previousStatus: existing.status,
      },
    });

    return serializeWebhookDelivery(delivery);
  }

  private async recordWebhookAudit(
    context: RequestContext,
    action: string,
    endpoint: Pick<WebhookEndpoint, 'id' | 'url' | 'events' | 'status'>,
    metadata: Record<string, unknown> = {},
  ) {
    await this.audit.record({
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorApiKeyId: context.apiKeyId,
      action,
      resourceType: EventResourceType.WebhookEndpoint,
      resourceId: endpoint.id,
      metadata: {
        projectId: context.projectId,
        url: endpoint.url,
        events: endpoint.events,
        status: endpoint.status,
        ...metadata,
      },
    });
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
