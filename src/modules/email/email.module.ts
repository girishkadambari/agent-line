import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BrevoEmailProvider } from './brevo-email.provider';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

@Module({
  imports: [AuthModule],
  controllers: [EmailController],
  providers: [BrevoEmailProvider, EmailService],
  exports: [EmailService],
})
export class EmailModule {}
