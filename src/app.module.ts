import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentsModule } from './modules/agents/agents.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { CallsModule } from './modules/calls/calls.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NumbersModule } from './modules/numbers/numbers.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { UsageModule } from './modules/usage/usage.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { TwilioWebhooksModule } from './modules/providers/twilio/twilio-webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    AuditModule,
    WorkspacesModule,
    AgentsModule,
    NumbersModule,
    BillingModule,
    ConversationsModule,
    MessagesModule,
    CallsModule,
    WebhooksModule,
    UsageModule,
    TwilioWebhooksModule,
  ],
})
export class AppModule {}
