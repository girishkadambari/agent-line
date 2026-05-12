import { Module } from '@nestjs/common';

import { CallsModule } from '../../calls/calls.module';
import { MessagesModule } from '../../messages/messages.module';
import { TwilioSignatureService } from './twilio-signature.service';
import { TwilioWebhooksController } from './twilio-webhooks.controller';

@Module({
  imports: [CallsModule, MessagesModule],
  controllers: [TwilioWebhooksController],
  providers: [TwilioSignatureService],
})
export class TwilioWebhooksModule {}
