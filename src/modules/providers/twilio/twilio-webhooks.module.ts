import { Module } from '@nestjs/common';

import { MessagesModule } from '../../messages/messages.module';
import { TwilioWebhooksController } from './twilio-webhooks.controller';

@Module({
  imports: [MessagesModule],
  controllers: [TwilioWebhooksController],
})
export class TwilioWebhooksModule {}
