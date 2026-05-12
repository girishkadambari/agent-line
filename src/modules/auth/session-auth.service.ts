import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildCsrfCookie,
  buildExpiredCsrfCookie,
  buildExpiredSessionCookie,
  buildSessionCookie,
  createCsrfToken,
  createSessionToken,
  hashSessionToken,
} from './session-token.utils';
import { serializeCurrentUser } from './users.serializer';

interface GoogleProfileInput {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

@Injectable()
export class SessionAuthService {
  private readonly sessionDays = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async createSessionForGoogleUser(profile: GoogleProfileInput, response: Response) {
    const email = profile.email.toLowerCase();
    const user = await this.prisma.user.upsert({
      where: { email },
      update: {
        googleId: profile.sub,
        name: profile.name,
        avatarUrl: profile.picture,
      },
      create: {
        id: createId('usr'),
        email,
        googleId: profile.sub,
        name: profile.name,
        avatarUrl: profile.picture,
      },
    });

    const membership = await this.findOrCreateFirstWorkspace(user.id, user.email);
    const project = await this.findDefaultProject(membership.workspaceId);
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + this.sessionDays * 24 * 60 * 60 * 1000);
    const session = await this.prisma.userSession.create({
      data: {
        id: createId('ses'),
        userId: user.id,
        tokenHash: hashSessionToken(token),
        activeWorkspaceId: membership.workspaceId,
        activeProjectId: project.id,
        expiresAt,
      },
    });

    const maxAgeSeconds = this.sessionDays * 24 * 60 * 60;
    const secure = this.shouldUseSecureCookies();
    response.setHeader('Set-Cookie', [
      buildSessionCookie(token, maxAgeSeconds, secure),
      buildCsrfCookie(createCsrfToken(), maxAgeSeconds, secure),
    ]);

    await this.audit.record({
      workspaceId: membership.workspaceId,
      actorUserId: user.id,
      action: 'auth.login',
      resourceType: 'user_session',
      resourceId: session.id,
      metadata: { provider: 'google' },
    });

    return session;
  }

  async logout(sessionId: string | undefined, response: Response) {
    if (sessionId) {
      await this.prisma.userSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    response.setHeader('Set-Cookie', [buildExpiredSessionCookie(), buildExpiredCsrfCookie()]);
    return { loggedOut: true };
  }

  async getCurrentUser(userId: string, sessionId: string) {
    const [user, session, memberships] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.userSession.findUnique({
        where: { id: sessionId },
        include: { activeWorkspace: true, activeProject: true },
      }),
      this.prisma.workspaceMember.findMany({
        where: { userId, status: 'active' },
        include: {
          workspace: {
            include: {
              projects: {
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!user || !session) {
      throw new ApiException('unauthorized', 'Session user not found.', 401);
    }

    return serializeCurrentUser({ user, session, memberships });
  }

  async switchWorkspace(userId: string, sessionId: string, workspaceId: string, projectId?: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId, status: 'active' },
    });
    if (!membership) {
      throw new ApiException('forbidden', 'You are not a member of this workspace.', 403, { workspaceId });
    }

    const project = projectId
      ? await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } })
      : await this.findDefaultProject(workspaceId);

    if (!project) {
      throw new ApiException('not_found', 'Project not found for workspace.', 404, { workspaceId, projectId });
    }

    const session = await this.prisma.userSession.update({
      where: { id: sessionId },
      data: {
        activeWorkspaceId: workspaceId,
        activeProjectId: project.id,
      },
    });

    await this.audit.record({
      workspaceId,
      actorUserId: userId,
      action: 'workspace.switched',
      resourceType: 'user_session',
      resourceId: session.id,
      metadata: { projectId: project.id },
    });

    return { workspaceId, projectId: project.id };
  }

  private async findOrCreateFirstWorkspace(userId: string, email: string) {
    const existing = await this.prisma.workspaceMember.findFirst({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.$transaction(async (tx) => {
      const workspaceId = createId('ws');
      const projectId = createId('proj');
      const workspace = await tx.workspace.create({
        data: {
          id: workspaceId,
          name: `${email.split('@')[0]}'s workspace`,
          projects: {
            create: {
              id: projectId,
              name: 'Default project',
              environment: 'test',
            },
          },
          billingBalance: {
            create: {
              id: createId('bal'),
              balanceCents: 0,
              currency: 'USD',
            },
          },
        },
      });

      return tx.workspaceMember.create({
        data: {
          id: createId('mem'),
          workspaceId: workspace.id,
          userId,
          role: 'owner',
          status: 'active',
        },
      });
    });
  }

  private async findDefaultProject(workspaceId: string) {
    const project = await this.prisma.project.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });

    if (!project) {
      throw new ApiException('not_found', 'Workspace has no project.', 404, { workspaceId });
    }

    return project;
  }

  private shouldUseSecureCookies() {
    return this.config.get<string>('APP_ENV') !== 'local' && this.config.get<string>('NODE_ENV') !== 'test';
  }
}
