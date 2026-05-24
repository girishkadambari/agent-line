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
import { createAgentSchema, updateAgentSchema } from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { AllowApiKeyAuth } from '../auth/api-key-auth.decorator';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { AgentsService } from './agents.service';

@UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  listAgents(
    @CurrentContext() context: RequestContext,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.agents.listAgents(context, parseLimit(limit), cursor);
  }

  @Post()
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async createAgent(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createAgentSchema)) body: unknown,
  ) {
    return success(await this.agents.createAgent(context, createAgentSchema.parse(body)));
  }

  @Get('voices')
  listVoices() {
    // SDK expects a plain array, not a { data, pagination } envelope
    return this.agents.listVoices();
  }

  @Get(':id/summary')
  async getAgentSummary(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.agents.getAgentSummary(context, id));
  }

  @Get(':id')
  async getAgent(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.agents.getAgent(context, id));
  }

  @Patch(':id')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async updateAgent(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAgentSchema)) body: unknown,
  ) {
    return success(await this.agents.updateAgent(context, id, updateAgentSchema.parse(body)));
  }

  @Delete(':id')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async disableAgent(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.agents.disableAgent(context, id));
  }

  @Get(':id/calls')
  listAgentCalls(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.agents.listAgentCalls(context, id, parseLimit(limit), cursor);
  }

  @Get(':id/conversations')
  listAgentConversations(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('contactId') contactId?: string,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
  ) {
    return this.agents.listAgentConversations(context, id, parseLimit(limit), {
      cursor,
      contactId,
      channel,
      status,
    });
  }
}
