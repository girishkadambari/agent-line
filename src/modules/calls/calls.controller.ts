import { Body, Controller, Get, MessageEvent, Param, Post, Query, Sse, UseGuards } from '@nestjs/common';
import { from, map, mergeMap, Observable } from 'rxjs';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createCallSchema, createWebCallSchema, transferCallSchema } from '../../domain/schemas';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CallsService } from './calls.service';

@UseGuards(ApiKeyGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post()
  async createCall(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createCallSchema)) body: unknown,
  ) {
    return success(await this.calls.createOutboundCall(context, createCallSchema.parse(body)));
  }

  @Post('web')
  async createWebCallToken(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createWebCallSchema)) body: unknown,
  ) {
    return success(await this.calls.createWebCallToken(context, createWebCallSchema.parse(body)));
  }

  @Get()
  listCalls(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.calls.listCalls(context, parseLimit(limit));
  }

  @Get(':id')
  async getCall(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.calls.getCall(context, id));
  }

  @Post(':id/end')
  async endCall(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.calls.endCall(context, id));
  }

  @Post(':id/transfer')
  async transferCall(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transferCallSchema)) body: unknown,
  ) {
    return success(await this.calls.transferCall(context, id, transferCallSchema.parse(body)));
  }

  @Get(':id/transcript')
  listTranscript(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return this.calls.listTranscript(context, id);
  }

  @Get(':id/transcript/stream')
  @Sse()
  streamTranscript(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
  ): Observable<MessageEvent> {
    return from(this.calls.listTranscript(context, id)).pipe(
      mergeMap((response) => from(response.data)),
      map((turn) => ({ data: turn })),
    );
  }
}
