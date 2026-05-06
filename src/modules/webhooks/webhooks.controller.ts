import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createWebhookSchema,
  retryWebhookDeliverySchema,
  testWebhookSchema,
  updateWebhookSchema,
} from '../../domain/schemas';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { WebhooksService } from './webhooks.service';

@UseGuards(ApiKeyGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) { }

  @Get()
  listEndpoints(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.webhooks.listEndpoints(context, parseLimit(limit));
  }

  @Post()
  async createEndpoint(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createWebhookSchema)) body: unknown,
  ) {
    return success(await this.webhooks.createEndpoint(context, createWebhookSchema.parse(body)));
  }

  @Patch(':id')
  async updateEndpoint(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWebhookSchema)) body: unknown,
  ) {
    return success(await this.webhooks.updateEndpoint(context, id, updateWebhookSchema.parse(body)));
  }

  @Delete(':id')
  async disableEndpoint(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.webhooks.disableEndpoint(context, id));
  }

  @Post(':id/test')
  async testEndpoint(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(testWebhookSchema)) body: unknown,
  ) {
    return success(await this.webhooks.createTestDelivery(context, id, testWebhookSchema.parse(body)));
  }

  @Get('deliveries')
  listDeliveries(
    @CurrentContext() context: RequestContext,
    @Query('limit') limit?: string,
    @Query('endpointId') endpointId?: string,
    @Query('eventId') eventId?: string,
    @Query('status') status?: string,
  ) {
    return this.webhooks.listDeliveries(context, parseLimit(limit), {
      endpointId,
      eventId,
      status: status as never,
    });
  }

  @Post('deliveries/:id/retry')
  async retryDelivery(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(retryWebhookDeliverySchema)) body: unknown,
  ) {
    return success(
      await this.webhooks.retryDelivery(context, id, retryWebhookDeliverySchema.parse(body)),
    );
  }
}
