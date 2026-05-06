import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { EventsModule } from '../events/events.module';
import { MockProviderModule } from '../providers/mock/mock-provider.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

@Module({
  imports: [AuthModule, ContactsModule, ConversationsModule, EventsModule, MockProviderModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
