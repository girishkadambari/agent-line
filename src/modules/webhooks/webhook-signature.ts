import { createHmac, randomBytes } from 'node:crypto';

export interface WebhookSignatureHeaders {
  'vukho-signature': string;
  'vukho-timestamp': string;
}

export function createWebhookSecret() {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function signWebhookPayload(
  secret: string,
  payload: Record<string, unknown>,
  timestamp = Math.floor(Date.now() / 1000),
): WebhookSignatureHeaders {
  const encodedPayload = JSON.stringify(payload);
  const signedContent = `${timestamp}.${encodedPayload}`;
  const signature = createHmac('sha256', secret).update(signedContent).digest('hex');

  return {
    'vukho-signature': `v1=${signature}`,
    'vukho-timestamp': String(timestamp),
  };
}
