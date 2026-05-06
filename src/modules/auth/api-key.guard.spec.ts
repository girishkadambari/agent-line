import type { ExecutionContext } from '@nestjs/common';

import type { ApiException } from '../../common/errors/api.exception';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysService } from './api-keys.service';

function createExecutionContext(authorization?: string): ExecutionContext {
  const request = {
    headers: {
      authorization,
    },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  const apiKeys = new ApiKeysService({} as PrismaService, {} as AuditService);

  it('rejects missing API key', async () => {
    const guard = new ApiKeyGuard({} as PrismaService, apiKeys);

    await expect(guard.canActivate(createExecutionContext())).rejects.toMatchObject({
      code: 'unauthorized',
    } satisfies Partial<ApiException>);
  });

  it('rejects invalid API key', async () => {
    const prisma = {
      aPIKey: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const guard = new ApiKeyGuard(prisma, apiKeys);

    await expect(guard.canActivate(createExecutionContext('Bearer sk_test_missing'))).rejects.toMatchObject({
      code: 'unauthorized',
    } satisfies Partial<ApiException>);
  });

  it('attaches request context for a valid API key', async () => {
    const prisma = {
      aPIKey: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'key_123',
          workspaceId: 'ws_123',
          projectId: 'proj_123',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const guard = new ApiKeyGuard(prisma, apiKeys);
    const context = createExecutionContext('Bearer sk_test_valid');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const request = context.switchToHttp().getRequest();
    expect(request.agentLineContext).toEqual({
      apiKeyId: 'key_123',
      workspaceId: 'ws_123',
      projectId: 'proj_123',
    });
  });
});
