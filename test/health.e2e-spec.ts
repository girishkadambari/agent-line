import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { applyApiBehavior } from './apply-api-behavior';

describe('Health route', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.APP_ENV = 'test';
    process.env.TELECOM_PROVIDER = 'mock';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    applyApiBehavior(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health', async () => {
    await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect({
        data: {
          name: 'AgentLine',
          phase: 'production_backend_flows',
          status: 'ok',
        },
      });
  });
});
