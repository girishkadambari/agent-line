import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { ApiException } from '../../common/errors/api.exception';
import type { RequestWithSession } from './session.guard';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithSession>();

  if (!request.agentLineUser) {
    throw new ApiException('unauthorized', 'Missing authenticated user.', 401);
  }

  return request.agentLineUser;
});
