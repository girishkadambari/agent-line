import { Module } from '@nestjs/common';

import { TwilioSignatureService } from '../providers/twilio/twilio-signature.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InternalVoiceController } from './internal/internal-voice.controller';
import { InternalVoiceService } from './internal/internal-voice.service';
import { HostedLlmService } from './llm/hosted-llm.service';
import { VoiceInboundController } from './webhooks/voice-inbound.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InternalVoiceController, VoiceInboundController],
  providers: [InternalVoiceService, HostedLlmService, TwilioSignatureService],
  exports: [InternalVoiceService],
})
export class VukhoModule {}
