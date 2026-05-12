import { MockProviderService } from './mock-provider.service';

describe('MockProviderService', () => {
  it('returns deterministic searchable numbers', async () => {
    const provider = new MockProviderService();

    const result = await provider.searchNumbers({
      country: 'US',
      areaCode: '415',
      capabilities: ['sms', 'voice'],
    });

    expect(result.numbers).toHaveLength(5);
    expect(result.numbers[0]).toEqual({
      phoneNumber: '+14155551000',
      country: 'US',
      areaCode: '415',
      capabilities: ['sms', 'voice'],
    });
  });

  it('provisions a mock number behind the provider contract', async () => {
    const provider = new MockProviderService();

    await expect(
      provider.provisionNumber({
        workspaceId: 'ws_123',
        projectId: 'proj_123',
        country: 'US',
        areaCode: '650',
        capabilities: ['sms'],
      }),
    ).resolves.toMatchObject({
      provider: 'mock',
      providerNumberId: expect.stringMatching(/^mock_num_proj_123_650_/),
      phoneNumber: expect.stringMatching(/^\+1650555\d{4}$/),
      country: 'US',
      areaCode: '650',
      capabilities: ['sms'],
    });
  });
});
