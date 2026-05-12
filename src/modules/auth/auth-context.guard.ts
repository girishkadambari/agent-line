import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { ApiKeyGuard } from './api-key.guard';
import { SessionGuard } from './session.guard';

@Injectable()
export class AuthContextGuard implements CanActivate {
  constructor(
    private readonly apiKeyGuard: ApiKeyGuard,
    private readonly sessionGuard: SessionGuard,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers?.authorization;

    if (typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')) {
      return this.apiKeyGuard.canActivate(context);
    }

    return this.sessionGuard.canActivate(context);
  }
}
