import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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

@Injectable()
export class WebhooksService {
  private readonly deliveryTimeoutMs = 5000;

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
        status: input.simulateFailure ? 'failed' : 'succeeded',
        attemptCount: 1,
        lastStatusCode: input.simulateFailure ? 500 : 200,
        lastError: input.simulateFailure ? 'Mock webhook delivery failed.' : null,
        nextAttemptAt: input.simulateFailure ? this.nextRetryDate() : null,
      },
    });

    return {
      delivery: serializeWebhookDelivery(delivery),
      headers: signWebhookPayload(endpoint.secret, payload),
    };
  }

  async createDeliveriesForEvent(input: {
    workspaceId: string;
    projectId: string;
    id: string;
    type: string;
    payload: unknown;
  }) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        status: 'active',
        events: { has: input.type },
      },
    });
    const payload = this.createPayload(input);

    const deliveries = await Promise.all(
      endpoints.map(async (endpoint) => {
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

    const status = input.exhaust ? 'exhausted' : input.outcome;
    const delivery = await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        status,
        attemptCount: existing.attemptCount + 1,
        lastStatusCode: status === 'succeeded' ? 200 : 500,
        lastError: status === 'succeeded' ? null : 'Mock webhook retry failed.',
        nextAttemptAt: status === 'failed' ? this.nextRetryDate() : null,
      },
    });

    return serializeWebhookDelivery(delivery);
  }

  private createPayload(event: {
    id: string;
    type: string;
    workspaceId: string;
    projectId: string;
    payload: Record<string, unknown> | unknown;
  }) {
    return {
      id: event.id,
      type: event.type,
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      createdAt: new Date().toISOString(),
      data: event.payload,
    };
  }

  private nextRetryDate() {
    return new Date(Date.now() + 60 * 1000);
  }

  private async deliver(
    endpoint: { id: string; url: string; secret: string },
    deliveryId: string,
    payload: Record<string, unknown>,
  ) {
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

      return this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: response.ok ? 'succeeded' : 'failed',
          attemptCount: 1,
          lastStatusCode: response.status,
          lastError: response.ok ? null : `Webhook endpoint returned HTTP ${response.status}.`,
          nextAttemptAt: response.ok ? null : this.nextRetryDate(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook delivery failed.';
      return this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          attemptCount: 1,
          lastStatusCode: null,
          lastError: message,
          nextAttemptAt: this.nextRetryDate(),
        },
      });
    }
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
}
