import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';

import type { RequestContext } from '../../common/context/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { serializeDashboardSummary } from './dashboard.serializer';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getSummary(context: RequestContext) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const scope = {
      workspaceId: context.workspaceId,
      projectId: context.projectId,
    };

    const [
      agents,
      activeAgents,
      numbers,
      activeNumbers,
      conversations,
      messages,
      calls,
      webhooks,
      recentCalls,
      recentConversations,
      todayUsage,
      monthUsage,
      billingBalance,
    ] = await Promise.all([
      this.prisma.agent.count({ where: scope }),
      this.prisma.agent.count({ where: { ...scope, status: 'active' } }),
      this.prisma.phoneNumber.count({ where: scope }),
      this.prisma.phoneNumber.count({ where: { ...scope, status: 'active' } }),
      this.prisma.conversation.count({ where: scope }),
      this.prisma.message.count({ where: scope }),
      this.prisma.call.count({ where: scope }),
      this.prisma.webhookEndpoint.count({ where: scope }),
      this.prisma.call.findMany({
        where: scope,
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.conversation.findMany({
        where: scope,
        orderBy: { lastActivityAt: 'desc' },
        take: 5,
      }),
      this.prisma.usageEvent.aggregate({
        where: {
          ...scope,
          occurredAt: { gte: startOfDay },
        },
        _count: { _all: true },
        _sum: { totalCost: true },
      }),
      this.prisma.usageEvent.aggregate({
        where: {
          ...scope,
          occurredAt: { gte: startOfMonth },
        },
        _count: { _all: true },
        _sum: { totalCost: true },
      }),
      this.prisma.billingBalance.findUnique({
        where: { workspaceId: context.workspaceId },
      }),
    ]);

    return serializeDashboardSummary({
      counts: {
        agents,
        activeAgents,
        numbers,
        activeNumbers,
        conversations,
        messages,
        calls,
        webhooks,
      },
      recentCalls,
      recentConversations,
      usage: {
        todayCost: this.decimalToString(todayUsage._sum.totalCost),
        monthCost: this.decimalToString(monthUsage._sum.totalCost),
        todayEvents: todayUsage._count._all,
        monthEvents: monthUsage._count._all,
      },
      billingBalance,
      provider: {
        telecomProvider: this.config.get<string>('TELECOM_PROVIDER', 'twilio'),
        twilioMode: this.config.get<string>('TWILIO_MODE', 'test'),
        twilioReady: this.isTwilioReady(),
        stripeReady: this.hasConfig('STRIPE_SECRET_KEY'),
        brevoReady: this.hasConfig('BREVO_API_KEY') && this.hasConfig('BREVO_FROM_EMAIL'),
      },
    });
  }

  private decimalToString(value: Decimal | null) {
    return value?.toString() ?? '0';
  }

  private isTwilioReady() {
    const mode = this.config.get<string>('TWILIO_MODE', 'test');
    if (mode === 'test') {
      return this.hasConfig('TWILIO_TEST_ACCOUNT_SID') && this.hasConfig('TWILIO_TEST_AUTH_TOKEN');
    }

    return this.hasConfig('TWILIO_ACCOUNT_SID') && this.hasConfig('TWILIO_AUTH_TOKEN');
  }

  private hasConfig(key: string) {
    const value = this.config.get<string>(key);
    return Boolean(value && value.trim().length > 0);
  }
}
