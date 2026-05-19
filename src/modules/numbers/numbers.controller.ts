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
import { createNumberSchema, importNumberSchema, updateNumberSchema } from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { NumbersService } from './numbers.service';

@UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
@Controller()
export class NumbersController {
  constructor(private readonly numbers: NumbersService) {}

  @Get('numbers')
  listNumbers(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.numbers.listNumbers(context, parseLimit(limit));
  }

  @Post('numbers')
  @WorkspaceRoles('owner', 'admin', 'developer')
  async provisionNumber(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createNumberSchema)) body: unknown,
  ) {
    return success(await this.numbers.provisionNumber(context, createNumberSchema.parse(body)));
  }

  @Post('numbers/import')
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
  @WorkspaceRoles('owner', 'admin', 'developer')
  async updateNumber(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateNumberSchema)) body: unknown,
  ) {
    return success(await this.numbers.updateNumber(context, id, updateNumberSchema.parse(body)));
  }

  @Delete('numbers/:id')
  @WorkspaceRoles('owner', 'admin', 'developer')
  async releaseNumber(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.numbers.releaseNumber(context, id));
  }

  @Post('agents/:id/numbers')
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
  @WorkspaceRoles('owner', 'admin', 'developer')
  async detachNumberFromAgent(
    @CurrentContext() context: RequestContext,
    @Param('id') agentId: string,
    @Param('numberId') numberId: string,
  ) {
    return success(await this.numbers.detachNumberFromAgent(context, agentId, numberId));
  }
}
