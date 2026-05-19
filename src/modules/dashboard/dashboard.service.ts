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
      recentUsageEvents,
      failedWebhookDeliveries,
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
      this.prisma.usageEvent.findMany({
        where: {
          ...scope,
          occurredAt: { gte: this.startOfDate(this.daysAgo(6)) },
        },
        select: {
          occurredAt: true,
          quantity: true,
          totalCost: true,
        },
        orderBy: { occurredAt: 'asc' },
      }),
      this.prisma.webhookDelivery.count({
        where: {
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          status: { in: ['failed', 'retrying', 'exhausted'] },
        },
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
      onboarding: this.getWorkspaceOnboardingState({
        activeAgents,
        activeNumbers,
        activeWebhooks: webhooks,
      }),
      recentCalls,
      recentConversations,
      usage: {
        todayCost: this.decimalToString(todayUsage._sum.totalCost),
        monthCost: this.decimalToString(monthUsage._sum.totalCost),
        todayEvents: todayUsage._count._all,
        monthEvents: monthUsage._count._all,
        daily: this.fillDailyUsage(recentUsageEvents),
      },
      failedWebhookDeliveries,
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

  private fillDailyUsage(
    rows: Array<{
      occurredAt: Date;
      quantity: Decimal;
      totalCost: Decimal;
    }>,
  ) {
    const byDate = new Map<string, { quantity: Decimal; totalCost: Decimal }>();
    for (const row of rows) {
      const period = this.toDateKey(row.occurredAt);
      const current = byDate.get(period) ?? {
        quantity: new Decimal(0),
        totalCost: new Decimal(0),
      };
      byDate.set(period, {
        quantity: current.quantity.plus(row.quantity),
        totalCost: current.totalCost.plus(row.totalCost),
      });
    }

    return Array.from({ length: 7 }).map((_, index) => {
      const date = this.daysAgo(6 - index);
      const period = this.toDateKey(date);
      const row = byDate.get(period);

      return {
        period,
        quantity: this.decimalToString(row?.quantity ?? null),
        totalCost: this.decimalToString(row?.totalCost ?? null),
      };
    });
  }

  private daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private startOfDate(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
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

  private getWorkspaceOnboardingState(input: {
    activeAgents: number;
    activeNumbers: number;
    activeWebhooks: number;
  }) {
    const hasAgent = input.activeAgents > 0;
    const hasActiveNumber = input.activeNumbers > 0;
    const hasWebhook = input.activeWebhooks > 0;

    let nextAction: 'create_agent' | 'attach_number' | 'configure_webhook' | 'run_live_smoke' =
      'run_live_smoke';

    if (!hasAgent) {
      nextAction = 'create_agent';
    } else if (!hasActiveNumber) {
      nextAction = 'attach_number';
    } else if (!hasWebhook) {
      nextAction = 'configure_webhook';
    }

    return {
      hasAgent,
      hasActiveNumber,
      hasWebhook,
      readyForLiveTraffic: hasAgent && hasActiveNumber && hasWebhook,
      nextAction,
    };
  }
}
