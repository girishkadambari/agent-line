import type { ExecutionContext } from '@nestjs/common';

import { AuthContextGuard } from './auth-context.guard';
import type { ApiKeyGuard } from './api-key.guard';
import type { SessionGuard } from './session.guard';

function createContext(authorization?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AuthContextGuard', () => {
  it('uses API-key auth when bearer authorization is present', async () => {
    const apiKeyGuard = { canActivate: jest.fn().mockResolvedValue(true) } as unknown as ApiKeyGuard;
    const sessionGuard = { canActivate: jest.fn().mockResolvedValue(true) } as unknown as SessionGuard;
    const guard = new AuthContextGuard(apiKeyGuard, sessionGuard);

    await expect(guard.canActivate(createContext('Bearer sk_test_123'))).resolves.toBe(true);

    expect(apiKeyGuard.canActivate).toHaveBeenCalled();
    expect(sessionGuard.canActivate).not.toHaveBeenCalled();
  });

  it('uses session auth when bearer authorization is absent', async () => {
    const apiKeyGuard = { canActivate: jest.fn().mockResolvedValue(true) } as unknown as ApiKeyGuard;
    const sessionGuard = { canActivate: jest.fn().mockResolvedValue(true) } as unknown as SessionGuard;
    const guard = new AuthContextGuard(apiKeyGuard, sessionGuard);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);

    expect(sessionGuard.canActivate).toHaveBeenCalled();
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
  });
});
