import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { ApiException } from '../../../common/errors/api.exception';

@Injectable()
export class TwilioSignatureService {
  constructor(private readonly config: ConfigService) {}

  verifyCallback(input: {
    configuredUrl?: string;
    signature?: string;
    params: Record<string, unknown>;
  }) {
    // Skip validation in development — avoids ngrok URL mismatches during local testing.
    if (this.config.get<string>('NODE_ENV') === 'development') {
      return;
    }

    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!authToken) {
      throw new ApiException('provider_error', 'Twilio auth token is not configured.', 500);
    }
    if (!input.configuredUrl) {
      throw new ApiException('provider_error', 'Twilio callback URL is not configured.', 500);
    }
    if (!input.signature) {
      throw new ApiException('unauthorized', 'Missing Twilio callback signature.', 401);
    }

    const expected = this.createSignature(input.configuredUrl, input.params, authToken);
    if (!this.safeEquals(expected, input.signature)) {
      throw new ApiException('unauthorized', 'Invalid Twilio callback signature.', 401);
    }
  }

  createSignature(url: string, params: Record<string, unknown>, authToken: string) {
    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => `${acc}${key}${String(params[key] ?? '')}`, url);

    return createHmac('sha1', authToken).update(data).digest('base64');
  }

  private safeEquals(expected: string, actual: string) {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);

    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
