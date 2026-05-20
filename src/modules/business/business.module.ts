import { Module, forwardRef } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InteraktModule } from '../interakt/interakt.module';
import { RetellModule } from '../retell/retell.module';
import { AppointmentService } from './appointment.service';
import { BusinessProfileController } from './business-profile.controller';
import { BusinessProfileService } from './business-profile.service';
import { BusinessQueueService } from './business-queue.service';
import { SalonSchedulerService } from './salon-scheduler.service';

@Module({
  imports: [PrismaModule, AuthModule, InteraktModule, forwardRef(() => RetellModule)],
  controllers: [BusinessProfileController],
  providers: [BusinessProfileService, AppointmentService, BusinessQueueService, SalonSchedulerService],
  exports: [BusinessProfileService, AppointmentService, BusinessQueueService, SalonSchedulerService],
})
export class BusinessModule {}
