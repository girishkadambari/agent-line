import { Module } from '@nestjs/common';

import { MessagesModule } from '../../messages/messages.module';
import { TwilioSignatureService } from './twilio-signature.service';
import { TwilioWebhooksController } from './twilio-webhooks.controller';

@Module({
  imports: [MessagesModule],
  controllers: [TwilioWebhooksController],
  providers: [TwilioSignatureService],
})
export class TwilioWebhooksModule {}
