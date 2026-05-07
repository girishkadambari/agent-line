import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const workspaceId = process.env.AGENTLINE_LOCAL_WORKSPACE_ID ?? 'ws_local';
  const amountCents = Number.parseInt(process.env.AGENTLINE_LOCAL_TOPUP_CENTS ?? '5000', 10);

  if (Number.isNaN(amountCents) || amountCents <= 0) {
    throw new Error('AGENTLINE_LOCAL_TOPUP_CENTS must be a positive integer.');
  }

  const balance = await prisma.billingBalance.upsert({
    where: { workspaceId },
    update: {
      balanceCents: { increment: amountCents },
      spendLimitCents: { increment: amountCents },
    },
    create: {
      id: `bal_${workspaceId}`,
      workspaceId,
      currency: 'USD',
      balanceCents: amountCents,
      spendLimitCents: amountCents,
    },
  });

  console.log(
    `Topped up ${workspaceId} by $${(amountCents / 100).toFixed(2)}. New balance: $${(
      balance.balanceCents / 100
    ).toFixed(2)}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
