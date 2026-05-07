import { PrismaClient } from '@prisma/client';

import { apiKeyPrefix, hashApiKey } from '../src/modules/auth/api-key.utils';

const prisma = new PrismaClient();

async function main() {
  const workspaceId = 'ws_local';
  const projectId = 'proj_local';
  const seedApiKey = process.env.AGENTLINE_SEED_API_KEY ?? 'sk_test_agentline_local';

  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: {
      id: workspaceId,
      name: 'AgentLine Local',
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
    where: { email: 'local@agentline.dev' },
    update: {},
    create: {
      id: 'usr_local',
      email: 'local@agentline.dev',
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
      voice: 'alloy',
      beginMessage: 'Hi, this is AgentLine support. How can I help?',
      webhookUrl: 'https://example.com/agentline/webhook',
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
      systemPrompt: 'You help people confirm and reschedule appointments.',
      voice: 'verse',
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
      url: 'https://example.com/webhooks/agentline',
      secret: 'whsec_local',
      events: ['agent.message.received', 'agent.call.ended', 'webhook.test'],
    },
  });

  console.log(`Seeded AgentLine local data. API key: ${seedApiKey}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
