import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { success } from '../../../common/api/api-response';
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

@Controller('providers/twilio')
export class TwilioWebhooksController {
  constructor(
    private readonly config: ConfigService,
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
}
