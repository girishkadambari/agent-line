import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { EventsModule } from '../events/events.module';
import { MockProviderModule } from '../providers/mock/mock-provider.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [AuthModule, ContactsModule, ConversationsModule, EventsModule, MockProviderModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
