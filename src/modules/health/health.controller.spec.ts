import { Test } from '@nestjs/testing';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns AgentLine health metadata', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      data: {
        name: 'AgentLine',
        phase: 'phase_1_mock_core_product',
        status: 'ok',
      },
    });
  });

  it('can be compiled by Nest testing module', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
  });
});
