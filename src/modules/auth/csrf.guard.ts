import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { RequestWithContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { csrfCookieName, parseCookieHeader } from './session-token.utils';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    if (safeMethods.has(request.method)) {
      return true;
    }
    if (request.agentLineContext?.authType !== 'session') {
      return true;
    }

    const headerToken = this.readHeader(request.headers['x-csrf-token']);
    const cookieToken = parseCookieHeader(request.headers.cookie).get(csrfCookieName);

    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      throw new ApiException('forbidden', 'Invalid CSRF token.', 403);
    }

    return true;
  }

  private readHeader(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value ?? null;
  }
}
