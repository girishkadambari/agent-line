import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { ProvidersModule } from '../providers/providers.module';
import { UsageModule } from '../usage/usage.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { NumbersController } from './numbers.controller';
import { NumbersService } from './numbers.service';

@Module({
  imports: [AuditModule, AuthModule, ProvidersModule, UsageModule, EventsModule, WebhooksModule],
  controllers: [NumbersController],
  providers: [NumbersService],
  exports: [NumbersService],
})
export class NumbersModule {}
