import type { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';

import type { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

const now = new Date('2026-05-06T00:00:00.000Z');
const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
};

function callFixture() {
  return {
    id: 'call_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    conversationId: 'conv_123',
    phoneNumberId: 'num_123',
    contactId: 'ctc_123',
    direction: 'outbound',
    fromNumber: '+14155550100',
    toNumber: '+14155550123',
    status: 'completed',
    durationSeconds: 20,
    summary: null,
    outcome: 'completed',
    recordingId: null,
    provider: 'twilio',
    providerCallId: 'CA123',
    startedAt: now,
    endedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function conversationFixture() {
  return {
    id: 'conv_123',
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    agentId: 'agt_123',
    contactId: 'ctc_123',
    channel: 'sms',
    status: 'active',
    lastActivityAt: now,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe('DashboardService', () => {
  it('returns core product summary for the active workspace/project', async () => {
    const prisma = {
      agent: {
        count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2),
      },
      phoneNumber: {
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
      },
      conversation: {
        count: jest.fn().mockResolvedValue(4),
        findMany: jest.fn().mockResolvedValue([conversationFixture()]),
      },
      message: {
        count: jest.fn().mockResolvedValue(9),
      },
      call: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn().mockResolvedValue([callFixture()]),
      },
      webhookEndpoint: {
        count: jest.fn().mockResolvedValue(1),
      },
      usageEvent: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _count: { _all: 2 }, _sum: { totalCost: new Decimal('0.04') } })
          .mockResolvedValueOnce({ _count: { _all: 7 }, _sum: { totalCost: new Decimal('0.19') } }),
      },
      billingBalance: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'bal_123',
          workspaceId: context.workspaceId,
          currency: 'USD',
          balanceCents: 500,
          spendLimitCents: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          TELECOM_PROVIDER: 'twilio',
          TWILIO_MODE: 'live-dev',
          TWILIO_ACCOUNT_SID: 'AC123',
          TWILIO_AUTH_TOKEN: 'token',
          STRIPE_SECRET_KEY: 'sk_test_123',
          BREVO_API_KEY: 'xkeysib',
          BREVO_FROM_EMAIL: 'no-reply@example.com',
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;
    const service = new DashboardService(prisma, config);

    const result = await service.getSummary(context);

    expect(result.counts).toEqual({
      agents: 3,
      activeAgents: 2,
      numbers: 2,
      activeNumbers: 1,
      conversations: 4,
      messages: 9,
      calls: 5,
      webhooks: 1,
    });
    expect(result.recentCalls).toHaveLength(1);
    expect(result.recentConversations).toHaveLength(1);
    expect(result.usage).toEqual({
      todayCost: '0.04',
      monthCost: '0.19',
      todayEvents: 2,
      monthEvents: 7,
    });
    expect(result.provider).toEqual({
      telecomProvider: 'twilio',
      twilioMode: 'live-dev',
      twilioReady: true,
      stripeReady: true,
      brevoReady: true,
    });
  });
});
