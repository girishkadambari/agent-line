import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeClientService } from './stripe-client.service';

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, StripeClientService],
  exports: [BillingService],
})
export class BillingModule {}
