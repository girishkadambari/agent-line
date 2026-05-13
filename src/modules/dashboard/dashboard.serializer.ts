import type { BillingBalance, Call, Conversation } from '@prisma/client';

import { serializeBillingBalance } from '../billing/billing.serializer';
import { serializeCall } from '../calls/calls.serializer';
import { serializeConversation } from '../conversations/conversations.serializer';

export function serializeDashboardSummary(input: {
  counts: {
    agents: number;
    activeAgents: number;
    numbers: number;
    activeNumbers: number;
    conversations: number;
    messages: number;
    calls: number;
    webhooks: number;
  };
  recentCalls: Call[];
  recentConversations: Conversation[];
  usage: {
    todayCost: string;
    monthCost: string;
    todayEvents: number;
    monthEvents: number;
  };
  billingBalance: BillingBalance | null;
  provider: {
    telecomProvider: string;
    twilioMode: string;
    twilioReady: boolean;
    stripeReady: boolean;
    brevoReady: boolean;
  };
}) {
  return {
    counts: input.counts,
    recentCalls: input.recentCalls.map(serializeCall),
    recentConversations: input.recentConversations.map(serializeConversation),
    usage: input.usage,
    billingBalance: input.billingBalance ? serializeBillingBalance(input.billingBalance) : null,
    provider: input.provider,
  };
}
