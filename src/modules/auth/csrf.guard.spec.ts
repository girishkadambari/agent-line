import type { ExecutionContext } from '@nestjs/common';

import { CsrfGuard } from './csrf.guard';

function createContext(input: {
  method: string;
  authType?: 'api_key' | 'session';
  cookie?: string;
  csrfHeader?: string;
}) {
  const request = {
    method: input.method,
    headers: {
      cookie: input.cookie,
      'x-csrf-token': input.csrfHeader,
    },
    agentLineContext: input.authType ? { authType: input.authType } : undefined,
  };

  return {
    request,
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext,
  };
}

describe('CsrfGuard', () => {
  it('allows safe methods', () => {
    const guard = new CsrfGuard();
    const { context } = createContext({ method: 'GET', authType: 'session' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows API-key mutations without csrf token', () => {
    const guard = new CsrfGuard();
    const { context } = createContext({ method: 'POST', authType: 'api_key' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects session mutations without matching csrf token', () => {
    const guard = new CsrfGuard();
    const { context } = createContext({
      method: 'POST',
      authType: 'session',
      cookie: 'vukho_csrf=csrf_123',
      csrfHeader: 'csrf_456',
    });

    expect(() => guard.canActivate(context)).toThrow();
  });

  it('allows session mutations with matching csrf token', () => {
    const guard = new CsrfGuard();
    const { context } = createContext({
      method: 'POST',
      authType: 'session',
      cookie: 'vukho_csrf=csrf_123',
      csrfHeader: 'csrf_123',
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
