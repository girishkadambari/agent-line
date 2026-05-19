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
  onboarding: {
    hasAgent: boolean;
    hasActiveNumber: boolean;
    hasWebhook: boolean;
    readyForLiveTraffic: boolean;
    nextAction: 'create_agent' | 'attach_number' | 'configure_webhook' | 'run_live_smoke';
  };
  recentCalls: Call[];
  recentConversations: Conversation[];
  usage: {
    todayCost: string;
    monthCost: string;
    todayEvents: number;
    monthEvents: number;
    daily: Array<{
      period: string;
      quantity: string;
      totalCost: string;
    }>;
  };
  failedWebhookDeliveries: number;
  billingBalance: BillingBalance | null;
}) {
  return {
    counts: input.counts,
    onboarding: input.onboarding,
    recentCalls: input.recentCalls.map(serializeCall),
    recentConversations: input.recentConversations.map(serializeConversation),
    usage: input.usage,
    failedWebhookDeliveries: input.failedWebhookDeliveries,
    billingBalance: input.billingBalance ? serializeBillingBalance(input.billingBalance) : null,
  };
}
