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
import { createNumberSchema, importNumberSchema, searchNumbersSchema, updateNumberSchema } from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { AllowApiKeyAuth } from '../auth/api-key-auth.decorator';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { NumbersService } from './numbers.service';

@UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
@Controller()
export class NumbersController {
  constructor(private readonly numbers: NumbersService) {}

  /**
   * Search available phone numbers without purchasing.
   * Developers call this first to browse options with pricing, then POST /numbers with the chosen
   * `exactPhoneNumber` to buy it. Mirrors the Retell/Plivo search-then-buy flow.
   */
  @Get('numbers/search')
  @AllowApiKeyAuth()
  async searchNumbers(
    @Query('country') country?: string,
    @Query('areaCode') areaCode?: string,
    @Query('capabilities') capabilities?: string | string[],
  ) {
    const parsed = searchNumbersSchema.parse({
      country,
      areaCode,
      capabilities: Array.isArray(capabilities)
        ? capabilities
        : capabilities?.split(',').filter(Boolean),
    });
    return success(await this.numbers.searchAvailableNumbers(parsed));
  }

  @Get('numbers')
  listNumbers(
    @CurrentContext() context: RequestContext,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.numbers.listNumbers(context, parseLimit(limit), cursor);
  }

  @Post('numbers')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async provisionNumber(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createNumberSchema)) body: unknown,
  ) {
    return success(await this.numbers.provisionNumber(context, createNumberSchema.parse(body)));
  }

  @Post('numbers/import')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async importNumber(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(importNumberSchema)) body: unknown,
  ) {
    return success(await this.numbers.importNumber(context, importNumberSchema.parse(body)));
  }

  @Get('numbers/:id')
  async getNumber(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.numbers.getNumber(context, id));
  }

  @Patch('numbers/:id')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async updateNumber(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateNumberSchema)) body: unknown,
  ) {
    return success(await this.numbers.updateNumber(context, id, updateNumberSchema.parse(body)));
  }

  @Delete('numbers/:id')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async releaseNumber(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.numbers.releaseNumber(context, id));
  }

  @Get('numbers/:id/calls')
  listNumberCalls(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.numbers.listNumberCalls(context, id, parseLimit(limit), cursor);
  }

  @Get('numbers/:id/messages')
  listNumberMessages(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.numbers.listNumberMessages(context, id, parseLimit(limit), cursor);
  }

  @Post('agents/:id/numbers')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async attachNewNumberToAgent(
    @CurrentContext() context: RequestContext,
    @Param('id') agentId: string,
    @Body(new ZodValidationPipe(createNumberSchema)) body: unknown,
  ) {
    return success(
      await this.numbers.attachNewNumberToAgent(context, agentId, createNumberSchema.parse(body)),
    );
  }

  @Delete('agents/:id/numbers/:numberId')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async detachNumberFromAgent(
    @CurrentContext() context: RequestContext,
    @Param('id') agentId: string,
    @Param('numberId') numberId: string,
  ) {
    return success(await this.numbers.detachNumberFromAgent(context, agentId, numberId));
  }
}
