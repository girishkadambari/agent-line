import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SessionAuthService } from './session-auth.service';

const now = new Date('2026-05-12T00:00:00.000Z');

function createResponse() {
  return {
    setHeader: jest.fn(),
  } as unknown as Response;
}

function createService(prisma: PrismaService) {
  const audit = {
    record: jest.fn().mockResolvedValue({ id: 'audit_123' }),
  } as unknown as AuditService;
  const config = {
    get: jest.fn((key: string) => (key === 'APP_ENV' ? 'local' : undefined)),
  } as unknown as ConfigService;

  return { service: new SessionAuthService(prisma, audit, config), audit };
}

describe('SessionAuthService', () => {
  it('creates a Google user session in the first workspace', async () => {
    const prisma = {
      user: {
        upsert: jest.fn().mockResolvedValue({
          id: 'usr_123',
          email: 'girish@example.com',
          name: 'Girish',
          avatarUrl: 'https://example.com/avatar.png',
        }),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'mem_123', workspaceId: 'ws_123' }),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'proj_123', workspaceId: 'ws_123' }),
      },
      userSession: {
        create: jest.fn().mockResolvedValue({
          id: 'ses_123',
          userId: 'usr_123',
          activeWorkspaceId: 'ws_123',
          activeProjectId: 'proj_123',
        }),
      },
    } as unknown as PrismaService;
    const { service, audit } = createService(prisma);
    const response = createResponse();

    await service.createSessionForGoogleUser(
      {
        sub: 'google_123',
        email: 'Girish@Example.com',
        name: 'Girish',
        picture: 'https://example.com/avatar.png',
      },
      response,
    );

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'girish@example.com' },
      }),
    );
    expect(prisma.userSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'usr_123',
        activeWorkspaceId: 'ws_123',
        activeProjectId: 'proj_123',
      }),
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.arrayContaining([
        expect.stringContaining('agentline_session='),
        expect.stringContaining('agentline_csrf='),
      ]),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.login',
        actorUserId: 'usr_123',
      }),
    );
  });

  it('returns the current user with active session context', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'usr_123',
          email: 'girish@example.com',
          name: 'Girish',
          avatarUrl: null,
          googleId: 'google_123',
          createdAt: now,
          updatedAt: now,
        }),
      },
      userSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ses_123',
          userId: 'usr_123',
          activeWorkspaceId: 'ws_123',
          activeProjectId: 'proj_123',
          activeWorkspace: { id: 'ws_123', name: 'AgentLine', createdAt: now, updatedAt: now },
          activeProject: {
            id: 'proj_123',
            workspaceId: 'ws_123',
            name: 'Default project',
            environment: 'test',
            createdAt: now,
            updatedAt: now,
          },
        }),
      },
      workspaceMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mem_123',
            workspaceId: 'ws_123',
            userId: 'usr_123',
            role: 'owner',
            status: 'active',
            createdAt: now,
            updatedAt: now,
            workspace: {
              id: 'ws_123',
              name: 'AgentLine',
              createdAt: now,
              updatedAt: now,
              projects: [
                {
                  id: 'proj_123',
                  workspaceId: 'ws_123',
                  name: 'Default project',
                  environment: 'test',
                  createdAt: now,
                  updatedAt: now,
                },
              ],
            },
          },
        ]),
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    const result = await service.getCurrentUser('usr_123', 'ses_123');

    expect(result.activeWorkspaceId).toBe('ws_123');
    expect(result.workspaces).toHaveLength(1);
  });
});
