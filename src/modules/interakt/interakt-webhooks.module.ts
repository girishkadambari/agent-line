import { Module } from '@nestjs/common';

import { BusinessModule } from '../business/business.module';
import { InteraktWebhooksController } from './interakt-webhooks.controller';
import { InteraktModule } from './interakt.module';

@Module({
  imports: [BusinessModule, InteraktModule],
  controllers: [InteraktWebhooksController],
})
export class InteraktWebhooksModule {}
