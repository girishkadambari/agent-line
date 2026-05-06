import { signWebhookPayload } from './webhook-signature';

describe('webhook signature', () => {
  it('creates deterministic HMAC headers for a payload and timestamp', () => {
    const headers = signWebhookPayload('whsec_test', { id: 'evt_123' }, 1_777_777_777);

    expect(headers['agentline-timestamp']).toBe('1777777777');
    expect(headers['agentline-signature']).toMatch(/^v1=[a-f0-9]{64}$/);
    expect(headers).toEqual(
      signWebhookPayload('whsec_test', { id: 'evt_123' }, 1_777_777_777),
    );
  });
});
