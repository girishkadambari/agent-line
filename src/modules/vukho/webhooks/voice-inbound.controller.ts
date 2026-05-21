import { Body, Controller, Header, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';

import { createId } from '../../../common/ids';
import { PrismaService } from '../../prisma/prisma.service';
import { TwilioSignatureService } from '../../providers/twilio/twilio-signature.service';

interface TwilioVoiceInboundBody {
  CallSid?: string;
  From?: string;
  To?: string;
  CallStatus?: string;
}

/**
 * Handles inbound Twilio voice calls for Vukho agents.
 * Returns TwiML that streams audio to vukho-voice.
 * Creates a Call record so the internal API can look it up by callSid.
 */
@Controller('vukho/voice')
export class VoiceInboundController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly signatures: TwilioSignatureService,
  ) {}

  @Post('inbound')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async handleInbound(
    @Body() body: TwilioVoiceInboundBody,
    @Req() request: Request,
    @Headers('x-twilio-signature') signature?: string,
  ): Promise<string> {
    this.signatures.verifyCallback({
      configuredUrl: this.config.get<string>('TWILIO_VOICE_WEBHOOK_URL'),
      signature,
      params: body as Record<string, unknown>,
    });

    const callSid = body.CallSid;
    const from = body.From;
    const to = body.To;

    if (callSid && from && to) {
      await this.createCallRecord(callSid, from, to);
    }

    const streamUrl = this.resolveStreamUrl(request);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${this.escapeXml(streamUrl)}" />
  </Connect>
</Response>`;
  }

  private async createCallRecord(callSid: string, from: string, to: string): Promise<void> {
    // Find which phone number received this call
    const existingCall = await this.prisma.call.findFirst({
      where: { provider: 'twilio', providerCallId: callSid },
    });
    if (existingCall) {
      return;
    }

    const phoneNumber = await this.prisma.phoneNumber.findFirst({
      where: {
        phoneNumber: to,
        status: 'active',
        provider: 'twilio',
        capabilities: { has: 'voice' },
        agentId: { not: null },
      },
      include: { agent: true },
    });

    if (!phoneNumber?.agentId) return;

    // Find or create contact
    let contact = await this.prisma.contact.findFirst({
      where: { projectId: phoneNumber.projectId, phoneNumber: from },
    });

    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          id: createId('con'),
          workspaceId: phoneNumber.workspaceId,
          projectId: phoneNumber.projectId,
          phoneNumber: from,
        },
      });
    }

    // Find or create conversation
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        agentId: phoneNumber.agentId,
        contactId: contact.id,
        channel: 'voice',
        status: 'active',
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          id: createId('conv'),
          workspaceId: phoneNumber.workspaceId,
          projectId: phoneNumber.projectId,
          agentId: phoneNumber.agentId,
          contactId: contact.id,
          channel: 'voice',
          status: 'active',
          lastActivityAt: new Date(),
        },
      });
    }

    // Create call record — providerCallId = Twilio callSid for lookup
    await this.prisma.call.create({
      data: {
        id: createId('call'),
        workspaceId: phoneNumber.workspaceId,
        projectId: phoneNumber.projectId,
        agentId: phoneNumber.agentId,
        conversationId: conversation.id,
        phoneNumberId: phoneNumber.id,
        contactId: contact.id,
        direction: 'inbound',
        fromNumber: from,
        toNumber: to,
        status: 'ringing',
        provider: 'twilio',
        providerCallId: callSid,
        startedAt: new Date(),
      },
    });
  }

  private resolveStreamUrl(request: Request): string {
    const configured = this.config.get<string>('TWILIO_VOICE_STREAM_URL')?.trim();
    if (configured) {
      return configured;
    }

    const publicApiUrl = this.config.get<string>('PUBLIC_API_URL')?.trim();
    if (publicApiUrl) {
      return this.mediaStreamUrlFromPublicUrl(publicApiUrl);
    }

    const host = this.firstHeaderValue(request.headers['x-forwarded-host']) ??
      this.firstHeaderValue(request.headers.host) ??
      'localhost:3000';
    const forwardedProto = this.firstHeaderValue(request.headers['x-forwarded-proto']);
    const proto = forwardedProto === 'https' ? 'wss' : 'ws';
    return `${proto}://${host}/media-stream`;
  }

  private mediaStreamUrlFromPublicUrl(publicUrl: string): string {
    const url = new URL(publicUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/media-stream';
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  private firstHeaderValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
