import { Body, Controller, Header, Headers, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { success } from '../../../common/api/api-response';
import { ApiException } from '../../../common/errors/api.exception';
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
  ErrorCode?: string;
  ErrorMessage?: string;
}

interface TwilioVoiceStatusWebhookBody {
  CallSid?: string;
  CallStatus?: string;
  CallDuration?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  ErrorMessageText?: string;
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
        providerErrorCode: body.ErrorCode,
        providerErrorText: body.ErrorMessage,
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

    const streamUrl = this.config.get<string>('TWILIO_VOICE_STREAM_URL')?.trim();
    if (streamUrl) {
      return this.buildStreamingVoiceResponse(streamUrl);
    }

    const gatherUrl = this.getVoiceGatherCallbackUrl();
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      `<Gather input="speech" action="${this.escapeXml(gatherUrl)}" method="POST" timeout="5" speechTimeout="auto">`,
      '<Say voice="alice">Hello from Vukho. This is your live phone agent. Please say a short reply after the tone.</Say>',
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
        rawPayload: body as Record<string, unknown>,
      });
    }

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      '<Say voice="alice">Thanks. Vukho captured your response and saved it to the call transcript.</Say>',
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
        providerErrorCode: body.ErrorCode,
        providerErrorText: body.ErrorMessage ?? body.ErrorMessageText,
        rawPayload: body as Record<string, unknown>,
      }),
    );
  }

  private getVoiceGatherCallbackUrl() {
    const configured = this.config.get<string>('TWILIO_VOICE_GATHER_CALLBACK_URL')?.trim();
    if (configured) {
      return configured;
    }

    const voiceUrl = this.config.get<string>('TWILIO_VOICE_WEBHOOK_URL')?.trim();
    if (voiceUrl?.endsWith('/voice/inbound')) {
      return voiceUrl.replace(/\/voice\/inbound$/, '/voice/gather');
    }

    throw new ApiException(
      'provider_error',
      'TWILIO_VOICE_GATHER_CALLBACK_URL is required for live voice speech capture.',
      500,
      { config: 'TWILIO_VOICE_GATHER_CALLBACK_URL' },
    );
  }

  private buildStreamingVoiceResponse(streamUrl: string) {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      '<Connect>',
      `<Stream url="${this.escapeXml(streamUrl)}" />`,
      '</Connect>',
      '</Response>',
    ].join('');
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
