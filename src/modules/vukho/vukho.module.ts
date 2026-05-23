import { Module } from '@nestjs/common';

import { TwilioProviderService } from '../providers/twilio/twilio-provider.service';
import { TwilioSignatureService } from '../providers/twilio/twilio-signature.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsageModule } from '../usage/usage.module';
import { InternalVoiceController } from './internal/internal-voice.controller';
import { InternalVoiceService } from './internal/internal-voice.service';
import { HostedLlmService } from './llm/hosted-llm.service';
import { VoiceInboundController } from './webhooks/voice-inbound.controller';

@Module({
  imports: [PrismaModule, UsageModule],
  controllers: [InternalVoiceController, VoiceInboundController],
  providers: [InternalVoiceService, HostedLlmService, TwilioProviderService, TwilioSignatureService],
  exports: [InternalVoiceService],
})
export class VukhoModule {}
