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

  /**
   * Stream the agent's response as NDJSON so vukho-voice can start TTS
   * on the first sentence without waiting for the full reply.
   *
   * Each line: {"text":"...","interim":true|false}
   * The final line always has interim=false.
   */
  @Post(':callSid/turn')
  @HttpCode(200)
  async handleTurn(
    @Param('callSid') callSid: string,
    @Headers('x-vukho-secret') secret: string,
    @Body() body: { transcript: string },
    @Res({ passthrough: false }) res: Response,
  ) {
    this.service.verifySecret(secret);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering for proxied deployments.

    try {
      for await (const chunk of this.service.handleTurnStream(callSid, body.transcript)) {
        res.write(JSON.stringify({ text: chunk.text, interim: chunk.interim }) + '\n');
      }
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else {
        // Headers already sent — write an error line and close.
        res.write(JSON.stringify({ text: 'Sorry, something went wrong.', interim: false }) + '\n');
        res.end();
      }
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
