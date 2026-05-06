import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuthModule, EventsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
