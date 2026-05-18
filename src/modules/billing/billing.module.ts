import { forwardRef, Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { BillingRateCardService } from './billing-rate-card.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeClientService } from './stripe-client.service';

@Module({
  imports: [forwardRef(() => AuthModule), AuditModule, EmailModule],
  controllers: [BillingController],
  providers: [BillingService, BillingRateCardService, StripeClientService],
  exports: [BillingService, BillingRateCardService],
})
export class BillingModule {}
