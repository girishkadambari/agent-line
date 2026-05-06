import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiKeyPrefix, hashApiKey } from '../src/modules/auth/api-key.utils';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { applyApiBehavior } from './apply-api-behavior';

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const apiKey = 'sk_test_agentline_e2e';

describeWithDatabase('Phase 1 smoke flow with Postgres', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.TELECOM_PROVIDER = 'mock';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    applyApiBehavior(app);
    await app.init();

    prisma = app.get(PrismaService);
    await seedE2eData(prisma);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('runs the golden mock backend flow', async () => {
    const auth = { Authorization: `Bearer ${apiKey}` };

    await request(app.getHttpServer()).get('/v1/workspaces/current').set(auth).expect(200);

    const keyResponse = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(auth)
      .send({ label: 'E2E generated key' })
      .expect(201);
    expect(keyResponse.body.data.key).toMatch(/^sk_test_/);

    await request(app.getHttpServer())
      .post('/v1/numbers')
      .set(auth)
      .send({
        agentId: 'agt_e2e',
        country: 'US',
        areaCode: '415',
        capabilities: ['sms', 'voice'],
      })
      .expect(201);

    const outbound = await request(app.getHttpServer())
      .post('/v1/messages')
      .set(auth)
      .send({ agentId: 'agt_e2e', to: '+14155550123', body: 'Hello from e2e.' })
      .expect(201);
    expect(outbound.body.data.direction).toBe('outbound');

    const inbound = await request(app.getHttpServer())
      .post('/v1/simulations/inbound-sms')
      .set(auth)
      .send({ agentId: 'agt_e2e', from: '+14155550123', body: 'Inbound e2e.' })
      .expect(201);
    expect(inbound.body.data.direction).toBe('inbound');

    const call = await request(app.getHttpServer())
      .post('/v1/calls')
      .set(auth)
      .send({ agentId: 'agt_e2e', to: '+14155550123' })
      .expect(201);
    expect(call.body.data.status).toBe('completed');

    await request(app.getHttpServer())
      .get(`/v1/calls/${call.body.data.id}/transcript`)
      .set(auth)
      .expect(200);

    const webhook = await request(app.getHttpServer())
      .post('/v1/webhooks')
      .set(auth)
      .send({
        url: 'https://example.com/e2e-webhook',
        events: ['webhook.test', 'agent.message.sent', 'agent.call.completed'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/webhooks/${webhook.body.data.id}/test`)
      .set(auth)
      .send({})
      .expect(201);

    await request(app.getHttpServer()).get('/v1/usage').set(auth).expect(200);
    await request(app.getHttpServer()).get('/v1/billing/balance').set(auth).expect(200);

    const twilioInbound = await request(app.getHttpServer())
      .post('/v1/providers/twilio/sms/inbound')
      .type('form')
      .send({
        MessageSid: 'SM_e2e_inbound',
        From: '+14155550123',
        To: '+14155559999',
        Body: 'Inbound from Twilio callback.',
      })
      .expect(201);
    expect(twilioInbound.body.data.ignored).toBe(false);

    await request(app.getHttpServer())
      .post('/v1/providers/twilio/sms/status')
      .type('form')
      .send({
        MessageSid: 'SM_e2e_inbound',
        MessageStatus: 'delivered',
      })
      .expect(201);
  });
});

async function seedE2eData(prisma: PrismaService) {
  await prisma.billingTransaction.deleteMany({});
  await prisma.internalEvent.deleteMany({});
  await prisma.providerRawEvent.deleteMany({});
  await prisma.usageEvent.deleteMany({});
  await prisma.webhookDelivery.deleteMany({});
  await prisma.webhookEndpoint.deleteMany({});
  await prisma.transcriptTurn.deleteMany({});
  await prisma.call.deleteMany({});
  await prisma.recording.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.contact.deleteMany({});
  await prisma.phoneNumber.deleteMany({});
  await prisma.agent.deleteMany({});
  await prisma.aPIKey.deleteMany({});
  await prisma.billingAccount.deleteMany({});
  await prisma.billingBalance.deleteMany({});
  await prisma.auditEvent.deleteMany({});
  await prisma.workspaceInvite.deleteMany({});
  await prisma.workspaceMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.workspace.deleteMany({});

  await prisma.workspace.create({
    data: { id: 'ws_e2e', name: 'AgentLine E2E' },
  });
  await prisma.project.create({
    data: { id: 'proj_e2e', workspaceId: 'ws_e2e', name: 'E2E Project' },
  });
  await prisma.user.create({
    data: { id: 'usr_e2e', email: 'e2e@agentline.dev', name: 'E2E User' },
  });
  await prisma.workspaceMember.create({
    data: { id: 'mem_e2e', workspaceId: 'ws_e2e', userId: 'usr_e2e', role: 'owner' },
  });
  await prisma.billingBalance.create({
    data: { id: 'bal_e2e', workspaceId: 'ws_e2e', currency: 'USD', balanceCents: 10000 },
  });
  await prisma.aPIKey.create({
    data: {
      id: 'key_e2e',
      workspaceId: 'ws_e2e',
      projectId: 'proj_e2e',
      label: 'E2E key',
      prefix: apiKeyPrefix(apiKey),
      keyHash: hashApiKey(apiKey),
    },
  });
  await prisma.agent.create({
    data: {
      id: 'agt_e2e',
      workspaceId: 'ws_e2e',
      projectId: 'proj_e2e',
      name: 'E2E Agent',
      mode: 'webhook',
      voice: 'alloy',
      systemPrompt: 'You are an e2e test agent.',
    },
  });
  await prisma.phoneNumber.create({
    data: {
      id: 'num_twilio_e2e',
      workspaceId: 'ws_e2e',
      projectId: 'proj_e2e',
      agentId: 'agt_e2e',
      phoneNumber: '+14155559999',
      country: 'US',
      areaCode: '415',
      capabilities: ['sms', 'voice'],
      status: 'active',
      provider: 'twilio',
      providerNumberId: 'PN_e2e',
    },
  });
}
