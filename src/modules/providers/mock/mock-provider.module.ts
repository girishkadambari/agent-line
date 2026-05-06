import { Module } from '@nestjs/common';

import { MockProviderService } from './mock-provider.service';

@Module({
  providers: [MockProviderService],
  exports: [MockProviderService],
})
export class MockProviderModule {}
