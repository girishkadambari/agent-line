import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import type { PrismaService } from '../prisma/prisma.service';
import { WorkspaceRoleGuard } from './workspace-role.guard';

function createContext(input: {
  authType: 'api_key' | 'session';
  userId?: string;
  workspaceId?: string;
}) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        agentLineContext: {
          authType: input.authType,
          userId: input.userId,
          workspaceId: input.workspaceId ?? 'ws_123',
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('WorkspaceRoleGuard', () => {
  it('allows API key requests for backward compatibility', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['owner']),
    } as unknown as Reflector;
    const prisma = {} as PrismaService;
    const guard = new WorkspaceRoleGuard(reflector, prisma);

    await expect(guard.canActivate(createContext({ authType: 'api_key' }))).resolves.toBe(true);
  });

  it('allows session users with an accepted role', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['owner', 'admin']),
    } as unknown as Reflector;
    const prisma = {
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ role: 'admin' }),
      },
    } as unknown as PrismaService;
    const guard = new WorkspaceRoleGuard(reflector, prisma);

    await expect(
      guard.canActivate(createContext({ authType: 'session', userId: 'usr_123' })),
    ).resolves.toBe(true);
  });

  it('rejects session users without an accepted role', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['owner']),
    } as unknown as Reflector;
    const prisma = {
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ role: 'viewer' }),
      },
    } as unknown as PrismaService;
    const guard = new WorkspaceRoleGuard(reflector, prisma);

    await expect(
      guard.canActivate(createContext({ authType: 'session', userId: 'usr_123' })),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
