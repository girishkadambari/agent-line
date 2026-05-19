import { Body, Controller, Get, Headers, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  billingCostQuerySchema,
  createCheckoutSessionSchema,
  createPortalSessionSchema,
  createSubscriptionCheckoutSessionSchema,
  updateBillingControlsSchema,
} from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @UseGuards(AuthContextGuard, WorkspaceRoleGuard)
  @WorkspaceRoles('owner', 'admin', 'billing')
  @Get('balance')
  async getBalance(@CurrentContext() context: RequestContext) {
    return success(await this.billing.getBalance(context));
  }

  @UseGuards(AuthContextGuard)
  @Get('pricing')
  async getPricing() {
    return success(await this.billing.getPricing());
  }

  @UseGuards(AuthContextGuard)
  @Get('plans')
  getPlans() {
    return success(this.billing.getPlans());
  }

  @UseGuards(AuthContextGuard, WorkspaceRoleGuard)
  @WorkspaceRoles('owner', 'admin', 'billing')
  @Get('subscription')
  async getSubscription(@CurrentContext() context: RequestContext) {
    return success(await this.billing.getSubscription(context));
  }

  @UseGuards(AuthContextGuard, WorkspaceRoleGuard)
  @WorkspaceRoles('owner', 'admin', 'developer', 'billing')
  @Get('cost-summary')
  async getCostSummary(
    @CurrentContext() context: RequestContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return success(
      await this.billing.getCostSummary(context, billingCostQuerySchema.parse({ from, to })),
    );
  }

  @UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
  @WorkspaceRoles('owner', 'admin', 'billing')
  @Patch('controls')
  async updateControls(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(updateBillingControlsSchema)) body: unknown,
  ) {
    return success(
      await this.billing.updateControls(context, updateBillingControlsSchema.parse(body)),
    );
  }

  @UseGuards(AuthContextGuard, WorkspaceRoleGuard)
  @WorkspaceRoles('owner', 'admin', 'billing')
  @Get('stripe/status')
  getStripeStatus() {
    return success(this.billing.getStripeStatus());
  }

  @UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
  @WorkspaceRoles('owner', 'admin', 'billing')
  @Post('checkout-sessions')
  async createCheckoutSession(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createCheckoutSessionSchema)) body: unknown,
  ) {
    return success(
      await this.billing.createCheckoutSession(context, createCheckoutSessionSchema.parse(body)),
    );
  }

  @UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
  @WorkspaceRoles('owner', 'admin', 'billing')
  @Post('subscription-checkout-sessions')
  async createSubscriptionCheckoutSession(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createSubscriptionCheckoutSessionSchema)) body: unknown,
  ) {
    return success(
      await this.billing.createSubscriptionCheckoutSession(
        context,
        createSubscriptionCheckoutSessionSchema.parse(body),
      ),
    );
  }

  @UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
  @WorkspaceRoles('owner', 'admin', 'billing')
  @Post('portal-sessions')
  async createPortalSession(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createPortalSessionSchema)) body: unknown,
  ) {
    return success(
      await this.billing.createPortalSession(context, createPortalSessionSchema.parse(body)),
    );
  }

  @UseGuards(AuthContextGuard, WorkspaceRoleGuard)
  @WorkspaceRoles('owner', 'admin', 'billing')
  @Get('transactions')
  listTransactions(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.billing.listTransactions(context, parseLimit(limit));
  }

  @Post('stripe/webhook')
  async handleStripeWebhook(
    @Req() request: { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    return success(
      await this.billing.handleStripeWebhook(request.rawBody ?? Buffer.from(''), signature),
    );
  }
}
