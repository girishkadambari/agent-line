import { Body, Controller, Post } from '@nestjs/common';

import { success } from '../../../common/api/api-response';
import { MessagesService } from '../../messages/messages.service';

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
  constructor(private readonly messages: MessagesService) {}

  @Post('sms/inbound')
  async receiveInboundSms(@Body() body: TwilioSmsWebhookBody) {
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
  async receiveSmsStatus(@Body() body: TwilioSmsStatusWebhookBody) {
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
