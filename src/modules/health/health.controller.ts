import { Controller, Get } from '@nestjs/common';

import { success } from '../../common/api/api-response';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return success({
      name: 'AgentLine',
      phase: 'phase_1_mock_core_product',
      status: 'ok',
    });
  }
}
