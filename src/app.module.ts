import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { validateEnv } from './config/env.validation';
import { AgentsModule } from './modules/agents/agents.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { CallsModule } from './modules/calls/calls.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmailModule } from './modules/email/email.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NumbersModule } from './modules/numbers/numbers.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { UsageModule } from './modules/usage/usage.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { TwilioWebhooksModule } from './modules/providers/twilio/twilio-webhooks.module';
import { RetellModule } from './modules/retell/retell.module';
import { InteraktWebhooksModule } from './modules/interakt/interakt-webhooks.module';
import { BusinessModule } from './modules/business/business.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    HealthModule,
    AuditModule,
    EmailModule,
    WorkspacesModule,
    AgentsModule,
    NumbersModule,
    BillingModule,
    ContactsModule,
    ConversationsModule,
    DashboardModule,
    MessagesModule,
    CallsModule,
    ProvidersModule,
    WebhooksModule,
    UsageModule,
    TwilioWebhooksModule,
    RetellModule,
    InteraktWebhooksModule,
    BusinessModule,
  ],
})
export class AppModule {}
