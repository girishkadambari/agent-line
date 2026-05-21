import { Body, Controller, Get, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { InternalVoiceService } from './internal-voice.service';

@Controller('internal/voice/calls')
export class InternalVoiceController {
  constructor(private readonly service: InternalVoiceService) {}

  @Get(':callSid/config')
  async getConfig(
    @Param('callSid') callSid: string,
    @Headers('x-vukho-secret') secret: string,
  ) {
    this.service.verifySecret(secret);
    return this.service.getCallConfig(callSid);
  }

  @Post(':callSid/turn')
  @HttpCode(200)
  async handleTurn(
    @Param('callSid') callSid: string,
    @Headers('x-vukho-secret') secret: string,
    @Body() body: { transcript: string },
    @Res({ passthrough: false }) res: Response,
  ) {
    this.service.verifySecret(secret);
    try {
      const result = await this.service.handleTurn(callSid, body.transcript);
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.write(JSON.stringify({ text: result.text, interim: false }) + '\n');
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  }

  @Post(':callSid/events')
  @HttpCode(200)
  async handleEvent(
    @Param('callSid') callSid: string,
    @Headers('x-vukho-secret') secret: string,
    @Body() body: { event: string; [key: string]: unknown },
  ) {
    this.service.verifySecret(secret);
    const { event, ...payload } = body;
    await this.service.handleEvent(callSid, event, payload);
    return { ok: true };
  }
}
