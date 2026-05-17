import { Body, Controller, Header, Headers, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { success } from '../../../common/api/api-response';
import { CallsService } from '../../calls/calls.service';
import { MessagesService } from '../../messages/messages.service';
import { TwilioSignatureService } from './twilio-signature.service';

interface TwilioSmsWebhookBody {
  MessageSid?: string;
  SmsSid?: string;
  From?: string;
  To?: string;
  Body?: string;
}

interface TwilioSmsStatusWebhookBody {
  MessageSid?: string;
  SmsSid?: string;
  MessageStatus?: string;
  SmsStatus?: string;
}

interface TwilioVoiceStatusWebhookBody {
  CallSid?: string;
  CallStatus?: string;
  CallDuration?: string;
}

interface TwilioVoiceInboundWebhookBody {
  CallSid?: string;
  From?: string;
  To?: string;
  CallStatus?: string;
}

interface TwilioVoiceGatherWebhookBody {
  CallSid?: string;
  SpeechResult?: string;
  Confidence?: string;
}

@Controller('providers/twilio')
export class TwilioWebhooksController {
  constructor(
    private readonly config: ConfigService,
    private readonly calls: CallsService,
    private readonly messages: MessagesService,
    private readonly signatures: TwilioSignatureService,
  ) {}

  @Post('sms/inbound')
  async receiveInboundSms(
    @Body() body: TwilioSmsWebhookBody,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.signatures.verifyCallback({
      configuredUrl: this.config.get<string>('TWILIO_INBOUND_SMS_WEBHOOK_URL'),
      signature,
      params: body as Record<string, unknown>,
    });

    const providerEventId = body.MessageSid ?? body.SmsSid;
    if (!providerEventId || !body.From || !body.To) {
      return success({ received: true, ignored: true });
    }

    return success(
      await this.messages.receiveProviderInboundSms({
        provider: 'twilio',
        providerEventId,
        from: body.From,
        to: body.To,
        body: body.Body ?? '',
        rawPayload: body as Record<string, unknown>,
      }),
    );
  }

  @Post('sms/status')
  async receiveSmsStatus(
    @Body() body: TwilioSmsStatusWebhookBody,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.signatures.verifyCallback({
      configuredUrl: this.config.get<string>('TWILIO_MESSAGE_STATUS_CALLBACK_URL'),
      signature,
      params: body as Record<string, unknown>,
    });

    const providerMessageId = body.MessageSid ?? body.SmsSid;
    const status = body.MessageStatus ?? body.SmsStatus;
    if (!providerMessageId || !status) {
      return success({ received: true, ignored: true });
    }

    return success(
      await this.messages.receiveProviderSmsStatus({
        provider: 'twilio',
        providerMessageId,
        status,
        rawPayload: body as Record<string, unknown>,
      }),
    );
  }

  @Post('voice/inbound')
  @Header('Content-Type', 'text/xml')
  async receiveVoiceTwiML(
    @Body() body: TwilioVoiceInboundWebhookBody,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.signatures.verifyCallback({
      configuredUrl: this.config.get<string>('TWILIO_VOICE_WEBHOOK_URL'),
      signature,
      params: body as Record<string, unknown>,
    });

    if (body.CallSid && body.From && body.To) {
      await this.calls.receiveProviderInboundCall({
        provider: 'twilio',
        providerCallId: body.CallSid,
        from: body.From,
        to: body.To,
        status: body.CallStatus,
        rawPayload: body as Record<string, unknown>,
      });
    } else if (body.CallSid) {
      await this.calls.receiveProviderVoicePrompt({
        provider: 'twilio',
        providerCallId: body.CallSid,
      });
    }

    const gatherUrl = this.getVoiceGatherCallbackUrl();

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      `<Gather input="speech" action="${this.escapeXml(gatherUrl)}" method="POST" timeout="5" speechTimeout="auto">`,
      '<Say voice="alice">Hello from AgentLine. This is your live phone agent. Please say a short reply after the tone.</Say>',
      '</Gather>',
      '<Say voice="alice">I did not receive a response. Goodbye.</Say>',
      '</Response>',
    ].join('');
  }

  @Post('voice/gather')
  @Header('Content-Type', 'text/xml')
  async receiveVoiceGather(
    @Body() body: TwilioVoiceGatherWebhookBody,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.signatures.verifyCallback({
      configuredUrl: this.getVoiceGatherCallbackUrl(),
      signature,
      params: body as Record<string, unknown>,
    });

    if (body.CallSid && body.SpeechResult) {
      await this.calls.receiveProviderVoiceSpeech({
        provider: 'twilio',
        providerCallId: body.CallSid,
        speechResult: body.SpeechResult,
        confidence: body.Confidence ? Number.parseFloat(body.Confidence) : undefined,
      });
    }

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      '<Say voice="alice">Thanks. AgentLine captured your response and saved it to the call transcript.</Say>',
      '</Response>',
    ].join('');
  }

  @Post('voice/status')
  async receiveVoiceStatus(
    @Body() body: TwilioVoiceStatusWebhookBody,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.signatures.verifyCallback({
      configuredUrl: this.config.get<string>('TWILIO_VOICE_STATUS_CALLBACK_URL'),
      signature,
      params: body as Record<string, unknown>,
    });

    if (!body.CallSid || !body.CallStatus) {
      return success({ received: true, ignored: true });
    }

    const durationSeconds = body.CallDuration ? Number.parseInt(body.CallDuration, 10) : undefined;
    return success(
      await this.calls.receiveProviderCallStatus({
        provider: 'twilio',
        providerCallId: body.CallSid,
        status: body.CallStatus,
        durationSeconds: Number.isNaN(durationSeconds) ? undefined : durationSeconds,
        rawPayload: body as Record<string, unknown>,
      }),
    );
  }

  private getVoiceGatherCallbackUrl() {
    const configured = this.config.get<string>('TWILIO_VOICE_GATHER_CALLBACK_URL');
    if (configured) {
      return configured;
    }

    const voiceUrl = this.config.get<string>('TWILIO_VOICE_WEBHOOK_URL');
    if (voiceUrl?.endsWith('/voice/inbound')) {
      return voiceUrl.replace(/\/voice\/inbound$/, '/voice/gather');
    }

    return 'https://example.com/agentline/voice/gather';
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
