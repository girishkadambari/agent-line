import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RequestWithContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { hashSessionToken, parseCookieHeader, sessionCookieName } from './session-token.utils';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface RequestWithSession extends RequestWithContext {
  agentLineUser?: SessionUser;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const token = this.readSessionToken(request);

    if (!token) {
      throw new ApiException('unauthorized', 'Missing session.', 401);
    }

    const session = await this.prisma.userSession.findFirst({
      where: {
        tokenHash: hashSessionToken(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: true,
        activeProject: true,
      },
    });

    if (!session || session.activeProject.workspaceId !== session.activeWorkspaceId) {
      throw new ApiException('unauthorized', 'Invalid session.', 401);
    }

    request.agentLineUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarUrl: session.user.avatarUrl,
    };
    request.agentLineContext = {
      workspaceId: session.activeWorkspaceId,
      projectId: session.activeProjectId,
      authType: 'session',
      userId: session.userId,
      sessionId: session.id,
    };

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return true;
  }

  private readSessionToken(request: RequestWithSession) {
    const cookies = parseCookieHeader(request.headers.cookie);
    return cookies.get(sessionCookieName) ?? null;
  }
}
