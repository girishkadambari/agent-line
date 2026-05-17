import type { PrismaService } from '../prisma/prisma.service';
import { BillingRateCardService } from './billing-rate-card.service';

const now = new Date('2026-05-17T00:00:00.000Z');

describe('BillingRateCardService', () => {
  it('returns the active database rate card when present', async () => {
    const prisma = {
      billingRateCard: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ratecard_20260517',
          version: '2026-05-17',
          status: 'active',
          currency: 'USD',
          description: 'Launch pricing',
          effectiveAt: now,
          createdAt: now,
          updatedAt: now,
          rates: [
            {
              id: 'rate_voice',
              key: 'voice_minute',
              resourceType: 'call',
              channel: 'voice',
              unit: 'minute',
              unitCostCents: 3,
              formula: 'ceil(duration_seconds / 60) * voice_minute',
              active: true,
              metadata: {},
              createdAt: now,
              updatedAt: now,
            },
          ],
        }),
      },
    } as unknown as PrismaService;
    const service = new BillingRateCardService(prisma);

    await expect(service.getActiveRateCard()).resolves.toEqual({
      version: '2026-05-17',
      currency: 'USD',
      source: 'database',
      rates: [
        {
          key: 'voice_minute',
          resourceType: 'call',
          channel: 'voice',
          unit: 'minute',
          unitCostCents: 3,
          formula: 'ceil(duration_seconds / 60) * voice_minute',
          pricingVersion: '2026-05-17',
          source: 'database',
        },
      ],
    });
  });

  it('falls back to default launch rates when the database has no active card', async () => {
    const prisma = {
      billingRateCard: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const service = new BillingRateCardService(prisma);

    const rate = await service.getRate('sms_outbound');

    expect(rate).toEqual(
      expect.objectContaining({
        key: 'sms_outbound',
        unitCostCents: 1,
        pricingVersion: '2026-05-17',
        source: 'default',
      }),
    );
  });
});
