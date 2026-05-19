import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createWebhookSchema,
  retryWebhookDeliverySchema,
  testWebhookSchema,
  updateWebhookSchema,
  webhookDeliveryStatusQuerySchema,
} from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { WebhooksService } from './webhooks.service';

@UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  listEndpoints(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.webhooks.listEndpoints(context, parseLimit(limit));
  }

  @Get('events')
  listEventCatalog() {
    return success(this.webhooks.listEventCatalog());
  }

  @Post()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async createEndpoint(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createWebhookSchema)) body: unknown,
  ) {
    return success(await this.webhooks.createEndpoint(context, createWebhookSchema.parse(body)));
  }

  @Patch(':id')
  @WorkspaceRoles('owner', 'admin', 'developer')
  async updateEndpoint(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWebhookSchema)) body: unknown,
  ) {
    return success(
      await this.webhooks.updateEndpoint(context, id, updateWebhookSchema.parse(body)),
    );
  }

  @Delete(':id')
  @WorkspaceRoles('owner', 'admin', 'developer')
  async disableEndpoint(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.webhooks.disableEndpoint(context, id));
  }

  @Post(':id/test')
  @WorkspaceRoles('owner', 'admin', 'developer')
  async testEndpoint(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(testWebhookSchema)) body: unknown,
  ) {
    return success(
      await this.webhooks.createTestDelivery(context, id, testWebhookSchema.parse(body ?? {})),
    );
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
      status: webhookDeliveryStatusQuerySchema.parse(status),
    });
  }

  @Post('deliveries/process-due')
  @WorkspaceRoles('owner', 'admin', 'developer')
  processDueDeliveries(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.webhooks.processDueDeliveries(context, parseLimit(limit, 25, 50));
  }

  @Post('deliveries/:id/replay')
  @WorkspaceRoles('owner', 'admin', 'developer')
  async replayDelivery(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.webhooks.replayDelivery(context, id));
  }

  @Post('deliveries/:id/retry')
  @WorkspaceRoles('owner', 'admin', 'developer')
  async retryDelivery(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(retryWebhookDeliverySchema)) body: unknown,
  ) {
    return success(
      await this.webhooks.retryDelivery(context, id, retryWebhookDeliverySchema.parse(body ?? {})),
    );
  }
}
