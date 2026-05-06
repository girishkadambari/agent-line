import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import type { RequestWithContext } from './request-context';
import { ApiException } from '../errors/api.exception';

export const CurrentContext = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithContext>();

  if (!request.agentLineContext) {
    throw new ApiException('unauthorized', 'Missing AgentLine request context.', 401);
  }

  return request.agentLineContext;
});
