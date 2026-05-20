import type { ConfigService } from '@nestjs/config';

import type { CallsService } from '../../calls/calls.service';
import type { MessagesService } from '../../messages/messages.service';
import type { TwilioSignatureService } from './twilio-signature.service';
import { TwilioWebhooksController } from './twilio-webhooks.controller';

describe('TwilioWebhooksController', () => {
  function createController(config: Record<string, string | undefined>) {
    const calls = {
      receiveProviderInboundCall: jest.fn().mockResolvedValue({ received: true }),
      receiveProviderVoicePrompt: jest.fn().mockResolvedValue({ received: true }),
    } as unknown as CallsService;
    const messages = {} as unknown as MessagesService;
    const signatures = {
      verifyCallback: jest.fn(),
    } as unknown as TwilioSignatureService;

    const controller = new TwilioWebhooksController(
      {
        get: jest.fn((key: string, fallback?: string) => config[key] ?? fallback),
      } as unknown as ConfigService,
      calls,
      messages,
      signatures,
    );

    return { controller, calls, signatures };
  }

  it('returns Twilio media stream TwiML when a stream URL is configured', async () => {
    const { controller, calls, signatures } = createController({
      TWILIO_VOICE_WEBHOOK_URL: 'https://api.vukho.dev/v1/providers/twilio/voice/inbound',
      TWILIO_VOICE_STREAM_URL: 'wss://api.vukho.dev/v1/providers/twilio/stream',
    });

    const response = await controller.receiveVoiceTwiML(
      {
        CallSid: 'CA123',
        From: '+14155550100',
        To: '+14155551000',
        CallStatus: 'in-progress',
      },
      'valid-signature',
    );

    expect(signatures.verifyCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        configuredUrl: 'https://api.vukho.dev/v1/providers/twilio/voice/inbound',
      }),
    );
    expect(calls.receiveProviderInboundCall).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCallId: 'CA123',
        from: '+14155550100',
        to: '+14155551000',
      }),
    );
    expect(response).toContain('<Connect>');
    expect(response).toContain('<Stream url="wss://api.vukho.dev/v1/providers/twilio/stream" />');
    expect(response).not.toContain('<Gather');
  });
});
