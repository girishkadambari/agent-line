import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { applyApiBehavior } from './apply-api-behavior';

describe('Health route', () => {
  let app: INestApplication;

  beforeAll(async () => {
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
          phase: 'phase_1_mock_core_product',
          status: 'ok',
        },
      });
  });
});
