import { Injectable } from '@nestjs/common';

import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { PrismaService } from '../prisma/prisma.service';
import { serializeBillingBalance } from './billing.serializer';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(context: RequestContext) {
    const balance = await this.findOrCreateWorkspaceBalance(context.workspaceId);
    return serializeBillingBalance(balance);
  }

  async debitWorkspace(workspaceId: string, cents: number) {
    if (cents <= 0) {
      return this.findOrCreateWorkspaceBalance(workspaceId);
    }

    const balance = await this.findOrCreateWorkspaceBalance(workspaceId);

    if (balance.spendLimitCents !== null) {
      const spentCents = await this.getWorkspaceSpentCents(workspaceId);
      if (spentCents + cents > balance.spendLimitCents) {
        throw new ApiException('insufficient_balance', 'Usage exceeds workspace spend limit.', 402, {
          cents,
          spentCents,
          spendLimitCents: balance.spendLimitCents,
        });
      }
    }

    const result = await this.prisma.billingBalance.updateMany({
      where: {
        workspaceId,
        balanceCents: { gte: cents },
      },
      data: {
        balanceCents: { decrement: cents },
      },
    });

    if (result.count !== 1) {
      throw new ApiException('insufficient_balance', 'Usage exceeds workspace spend limit.', 402, {
        cents,
        balanceCents: balance.balanceCents,
      });
    }

    return this.prisma.billingBalance.findUniqueOrThrow({
      where: { workspaceId },
    });
  }

  private async getWorkspaceSpentCents(workspaceId: string) {
    const aggregate = await this.prisma.usageEvent.aggregate({
      where: { workspaceId },
      _sum: { totalCost: true },
    });
    const totalCost = aggregate._sum.totalCost;

    if (!totalCost) {
      return 0;
    }

    return Math.round(totalCost.toNumber() * 100);
  }

  private async findOrCreateWorkspaceBalance(workspaceId: string) {
    const existing = await this.prisma.billingBalance.findUnique({
      where: { workspaceId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.billingBalance.create({
      data: {
        id: createId('bal'),
        workspaceId,
        currency: 'USD',
        balanceCents: 500,
      },
    });
  }
}
