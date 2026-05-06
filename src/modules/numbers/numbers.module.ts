import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MockProviderModule } from '../providers/mock/mock-provider.module';
import { NumbersController } from './numbers.controller';
import { NumbersService } from './numbers.service';

@Module({
  imports: [AuthModule, MockProviderModule],
  controllers: [NumbersController],
  providers: [NumbersService],
  exports: [NumbersService],
})
export class NumbersModule {}
