import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { list, parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createAgentSchema, updateAgentSchema } from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { AgentsService } from './agents.service';

@UseGuards(AuthContextGuard, CsrfGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) { }

  @Get()
  listAgents(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.agents.listAgents(context, parseLimit(limit));
  }

  @Post()
  async createAgent(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createAgentSchema)) body: unknown,
  ) {
    return success(await this.agents.createAgent(context, createAgentSchema.parse(body)));
  }

  @Get('voices')
  listVoices() {
    return list(this.agents.listVoices());
  }

  @Get(':id')
  async getAgent(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.agents.getAgent(context, id));
  }

  @Patch(':id')
  async updateAgent(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAgentSchema)) body: unknown,
  ) {
    return success(await this.agents.updateAgent(context, id, updateAgentSchema.parse(body)));
  }

  @Delete(':id')
  async disableAgent(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.agents.disableAgent(context, id));
  }
}
