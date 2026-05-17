import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createApiKeySchema, updateApiKeySchema } from '../../domain/schemas';
import { ApiKeysService } from './api-keys.service';
import { AuthContextGuard } from './auth-context.guard';
import { CsrfGuard } from './csrf.guard';

@UseGuards(AuthContextGuard, CsrfGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  listApiKeys(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.apiKeys.listApiKeys(context, parseLimit(limit));
  }

  @Post()
  async createApiKey(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: unknown,
  ) {
    return success(await this.apiKeys.createApiKey(context, createApiKeySchema.parse(body)));
  }

  @Patch(':id')
  async updateApiKey(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateApiKeySchema)) body: unknown,
  ) {
    return success(await this.apiKeys.updateApiKey(context, id, updateApiKeySchema.parse(body)));
  }

  @Post(':id/rotate')
  async rotateApiKey(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.apiKeys.rotateApiKey(context, id));
  }

  @Delete(':id')
  async revokeApiKey(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.apiKeys.revokeApiKey(context, id));
  }
}
