import { PrismaClient } from '@prisma/client';

import { apiKeyPrefix, hashApiKey } from '../src/modules/auth/api-key.utils';
import { DEFAULT_USAGE_RATES, USAGE_PRICING_VERSION } from '../src/modules/usage/usage-pricing';

const prisma = new PrismaClient();

async function main() {
  const workspaceId = 'ws_local';
  const projectId = 'proj_local';
  const seedApiKey = process.env.VUKHO_SEED_API_KEY ?? 'sk_test_vukho_local';

  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: {
      id: workspaceId,
      name: 'Vukho Local',
    },
  });

  await prisma.project.upsert({
    where: { id: projectId },
    update: {},
    create: {
      id: projectId,
      workspaceId,
      name: 'Local Project',
      environment: 'test',
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'local@vukho.dev' },
    update: {},
    create: {
      id: 'usr_local',
      email: 'local@vukho.dev',
      name: 'Local Developer',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id,
      },
    },
    update: {},
    create: {
      id: 'mem_local_owner',
      workspaceId,
      userId: user.id,
      role: 'owner',
    },
  });

  await prisma.billingBalance.upsert({
    where: { workspaceId },
    update: {
      balanceCents: 5000,
      spendLimitCents: 50000,
    },
    create: {
      id: 'bal_local',
      workspaceId,
      currency: 'USD',
      balanceCents: 5000,
      spendLimitCents: 50000,
    },
  });

  const rateCard = await prisma.billingRateCard.upsert({
    where: { version: USAGE_PRICING_VERSION },
    update: {
      status: 'active',
      currency: 'USD',
      description: 'Default Vukho launch pricing.',
      effectiveAt: new Date('2026-05-17T00:00:00.000Z'),
    },
    create: {
      id: `ratecard_${USAGE_PRICING_VERSION.replaceAll('-', '')}`,
      version: USAGE_PRICING_VERSION,
      status: 'active',
      currency: 'USD',
      description: 'Default Vukho launch pricing.',
      effectiveAt: new Date('2026-05-17T00:00:00.000Z'),
    },
  });

  for (const rate of DEFAULT_USAGE_RATES) {
    await prisma.billingRate.upsert({
      where: {
        rateCardId_key: {
          rateCardId: rateCard.id,
          key: rate.key,
        },
      },
      update: {
        resourceType: rate.resourceType,
        channel: rate.channel,
        unit: rate.unit,
        unitCostCents: rate.unitCostCents,
        formula: rate.formula,
        active: true,
      },
      create: {
        id: `rate_${rate.key}_${USAGE_PRICING_VERSION.replaceAll('-', '')}`,
        rateCardId: rateCard.id,
        key: rate.key,
        resourceType: rate.resourceType,
        channel: rate.channel,
        unit: rate.unit,
        unitCostCents: rate.unitCostCents,
        formula: rate.formula,
      },
    });
  }

  await prisma.aPIKey.upsert({
    where: { id: 'key_local' },
    update: {
      keyHash: hashApiKey(seedApiKey),
      prefix: apiKeyPrefix(seedApiKey),
    },
    create: {
      id: 'key_local',
      workspaceId,
      projectId,
      label: 'Local development key',
      prefix: apiKeyPrefix(seedApiKey),
      keyHash: hashApiKey(seedApiKey),
    },
  });

  await prisma.agent.upsert({
    where: { id: 'agt_support' },
    update: {},
    create: {
      id: 'agt_support',
      workspaceId,
      projectId,
      name: 'Support Agent',
      description: 'Handles support calls and SMS in mock mode.',
      mode: 'webhook',
      systemPrompt: 'You are a concise support agent.',
      voice: 'ritu',
      beginMessage: 'Hi, this is Vukho support. How can I help?',
      webhookUrl: 'https://example.com/vukho/webhook',
    },
  });

  await prisma.agent.upsert({
    where: { id: 'agt_scheduler' },
    update: {},
    create: {
      id: 'agt_scheduler',
      workspaceId,
      projectId,
      name: 'Scheduling Agent',
      description: 'Confirms appointments and sends reminders.',
      mode: 'hosted',
      systemPrompt: 'You are a concise phone agent. Keep all replies under two sentences. No lists.',
      voice: 'rahul',
      language: 'en-IN',
      beginMessage: 'Hi, I am calling about your appointment.',
    },
  });

  await prisma.webhookEndpoint.upsert({
    where: { id: 'wh_local' },
    update: {},
    create: {
      id: 'wh_local',
      workspaceId,
      projectId,
      url: 'https://example.com/webhooks/vukho',
      secret: 'whsec_local',
      events: ['agent.message.*', 'agent.call.*', 'agent.number.*', 'webhook.test'],
    },
  });

  console.log(`Seeded Vukho local data. API key: ${seedApiKey}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
