import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_USAGE_RATES,
  USAGE_PRICING_VERSION,
  type UsageRateKey,
} from '../usage/usage-pricing';

export interface BillingRateSnapshot {
  key: UsageRateKey;
  resourceType: string;
  channel: string;
  unit: string;
  unitCostCents: number;
  formula: string;
  pricingVersion: string;
  source: 'database' | 'default';
}

@Injectable()
export class BillingRateCardService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveRateCard() {
    const rateCard = await this.findActiveRateCard();
    if (!rateCard) {
      return {
        version: USAGE_PRICING_VERSION,
        currency: 'USD',
        source: 'default' as const,
        rates: DEFAULT_USAGE_RATES.map((rate) => ({
          ...rate,
          pricingVersion: USAGE_PRICING_VERSION,
          source: 'default' as const,
        })),
      };
    }

    return {
      version: rateCard.version,
      currency: rateCard.currency,
      source: 'database' as const,
      rates: rateCard.rates.map((rate) => ({
        key: rate.key as UsageRateKey,
        resourceType: rate.resourceType,
        channel: rate.channel,
        unit: rate.unit,
        unitCostCents: rate.unitCostCents,
        formula: rate.formula,
        pricingVersion: rateCard.version,
        source: 'database' as const,
      })),
    };
  }

  async getRate(key: UsageRateKey): Promise<BillingRateSnapshot> {
    const rateCard = await this.getActiveRateCard();
    const rate = rateCard.rates.find((candidate) => candidate.key === key);
    if (rate) {
      return rate;
    }

    const fallback = DEFAULT_USAGE_RATES.find((candidate) => candidate.key === key)!;
    return {
      ...fallback,
      pricingVersion: USAGE_PRICING_VERSION,
      source: 'default',
    };
  }

  private findActiveRateCard() {
    return this.prisma.billingRateCard.findFirst({
      where: {
        status: 'active',
        effectiveAt: { lte: new Date() },
      },
      include: {
        rates: {
          where: { active: true },
          orderBy: { key: 'asc' },
        },
      },
      orderBy: { effectiveAt: 'desc' },
    });
  }
}
