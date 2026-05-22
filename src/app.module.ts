import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parse as parseDotenv } from 'dotenv';

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
import { VukhoModule } from './modules/vukho/vukho.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // Read .env via dotenv.parse and expose through ConfigService.
      // ignoreEnvVars: true makes ConfigService read ONLY from the loaded
      // config objects — never from process.env.  This prevents empty shell
      // exports (e.g. ANTHROPIC_API_KEY="") on developer machines from
      // silently shadowing values defined in .env.
      ignoreEnvVars: true,
      load: [
        () => {
          // Merge process.env first so system vars (DATABASE_URL, etc.) are
          // still available, then overlay with .env file values so .env wins.
          const fileVars = (() => {
            try {
              const envPath = resolve(process.cwd(), '.env');
              return parseDotenv(readFileSync(envPath));
            } catch {
              return {} as Record<string, string>;
            }
          })();
          return { ...process.env, ...fileVars };
        },
      ],
    }),
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
    VukhoModule,
  ],
})
export class AppModule {}
