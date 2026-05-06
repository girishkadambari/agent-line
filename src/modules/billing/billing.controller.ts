import { Body, Controller, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createCheckoutSessionSchema, createPortalSessionSchema } from '../../domain/schemas';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @UseGuards(ApiKeyGuard)
  @Get('balance')
  async getBalance(@CurrentContext() context: RequestContext) {
    return success(await this.billing.getBalance(context));
  }

  @UseGuards(ApiKeyGuard)
  @Post('checkout-sessions')
  async createCheckoutSession(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createCheckoutSessionSchema)) body: unknown,
  ) {
    return success(
      await this.billing.createCheckoutSession(context, createCheckoutSessionSchema.parse(body)),
    );
  }

  @UseGuards(ApiKeyGuard)
  @Post('portal-sessions')
  async createPortalSession(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createPortalSessionSchema)) body: unknown,
  ) {
    return success(
      await this.billing.createPortalSession(context, createPortalSessionSchema.parse(body)),
    );
  }

  @UseGuards(ApiKeyGuard)
  @Get('transactions')
  listTransactions(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.billing.listTransactions(context, parseLimit(limit));
  }

  @Post('stripe/webhook')
  async handleStripeWebhook(@Req() request: { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    return success(await this.billing.handleStripeWebhook(request.rawBody ?? Buffer.from(''), signature));
  }
}
