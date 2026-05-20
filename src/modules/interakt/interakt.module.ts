import { Module } from '@nestjs/common';

import { InteraktService } from './interakt.service';

@Module({
  providers: [InteraktService],
  exports: [InteraktService],
})
export class InteraktModule {}
