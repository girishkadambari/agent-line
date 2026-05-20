import { Module, forwardRef } from '@nestjs/common';

import { BusinessModule } from '../business/business.module';
import { RetellWebhooksController } from './retell-webhooks.controller';
import { RetellService } from './retell.service';

@Module({
  imports: [forwardRef(() => BusinessModule)],
  controllers: [RetellWebhooksController],
  providers: [RetellService],
  exports: [RetellService],
})
export class RetellModule {}
