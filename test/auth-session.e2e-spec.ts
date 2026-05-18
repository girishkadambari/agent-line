import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { GoogleOAuthService } from '../src/modules/auth/google-oauth.service';
import { csrfCookieName, sessionCookieName } from '../src/modules/auth/session-token.utils';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { applyApiBehavior } from './apply-api-behavior';

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDatabase('Google OAuth sessions with Postgres', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const google = {
    buildAuthorizationUrl: jest.fn((state: string) => `https://accounts.google.test/oauth?state=${state}`),
    exchangeCodeForUser: jest.fn(),
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.TELECOM_PROVIDER = 'mock';
    process.env.DASHBOARD_URL = 'http://localhost:5173';

    google.exchangeCodeForUser.mockResolvedValue({
      sub: 'google_e2e_user',
      email: 'session-user@vukho.dev',
      email_verified: true,
      name: 'Session User',
      picture: 'https://example.com/avatar.png',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleOAuthService)
      .useValue(google)
      .compile();

    app = moduleRef.createNestApplication();
    applyApiBehavior(app);
    await app.init();

    prisma = app.get(PrismaService);
    await cleanAuthE2eData(prisma);
  });

  afterAll(async () => {
    if (prisma) {
      await cleanAuthE2eData(prisma);
    }
    await app?.close();
  });

  it('creates a session from Google OAuth and uses it across workspace/product routes', async () => {
    const start = await request(app.getHttpServer()).get('/v1/auth/google/start').expect(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    expect(state).toBeTruthy();

    const callback = await request(app.getHttpServer())
      .get('/v1/auth/google/callback')
      .query({ code: 'google_code_e2e', state })
      .set('Cookie', selectCookies(start.headers['set-cookie'], ['vukho_oauth_state']))
      .expect(302);

    expect(callback.headers.location).toBe('http://localhost:5173');
    expect(google.exchangeCodeForUser).toHaveBeenCalledWith('google_code_e2e');

    const sessionCookies = selectCookies(callback.headers['set-cookie'], [
      sessionCookieName,
      csrfCookieName,
    ]);
    const csrf = readCookieValue(sessionCookies.join('; '), csrfCookieName);
    expect(csrf).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Cookie', sessionCookies)
      .expect(200);
    expect(me.body.data.email).toBe('session-user@vukho.dev');
    expect(me.body.data.workspaces).toHaveLength(1);

    const createdWorkspace = await request(app.getHttpServer())
      .post('/v1/workspaces')
      .set('Cookie', sessionCookies)
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Session E2E Workspace' })
      .expect(201);
    expect(createdWorkspace.body.data.projects).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/v1/workspaces/${createdWorkspace.body.data.id}/switch`)
      .set('Cookie', sessionCookies)
      .set('X-CSRF-Token', csrf)
      .send({ projectId: createdWorkspace.body.data.projects[0].id })
      .expect(201);

    const switched = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Cookie', sessionCookies)
      .expect(200);
    expect(switched.body.data.activeWorkspaceId).toBe(createdWorkspace.body.data.id);

    const agent = await request(app.getHttpServer())
      .post('/v1/agents')
      .set('Cookie', sessionCookies)
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Session E2E Agent',
        mode: 'webhook',
        webhookUrl: 'https://example.com/vukho/session-e2e',
      })
      .expect(201);
    expect(agent.body.data.name).toBe('Session E2E Agent');
    expect(agent.body.data.id).toMatch(/^agt_/);

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Cookie', sessionCookies)
      .set('X-CSRF-Token', csrf)
      .expect(201);

    await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Cookie', sessionCookies)
      .expect(401);
  });

  it('rejects OAuth callbacks with invalid state', async () => {
    await request(app.getHttpServer())
      .get('/v1/auth/google/callback')
      .query({ code: 'google_code_e2e', state: 'bad_state' })
      .set('Cookie', 'vukho_oauth_state=expected_state')
      .expect(400);
  });
});

function selectCookies(rawCookies: string | string[] | undefined, names: string[]) {
  const cookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
  return names
    .map((name) => cookies.find((cookie) => cookie.startsWith(`${name}=`))?.split(';')[0])
    .filter((cookie): cookie is string => Boolean(cookie));
}

function readCookieValue(cookieHeader: string, name: string) {
  return (
    cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ''
  );
}

async function cleanAuthE2eData(prisma: PrismaService) {
  await prisma.userSession.deleteMany({});
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
}
