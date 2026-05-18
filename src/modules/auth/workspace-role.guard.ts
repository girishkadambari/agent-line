import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { WorkspaceRole } from '@prisma/client';

import type { RequestWithContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { workspaceRolesMetadataKey } from './workspace-roles.decorator';

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<WorkspaceRole[]>(workspaceRolesMetadataKey, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const requestContext = request.agentLineContext;

    if (!requestContext) {
      throw new ApiException('unauthorized', 'Missing Vukho request context.', 401);
    }

    if (requestContext.authType === 'api_key') {
      return true;
    }

    if (!requestContext.userId) {
      throw new ApiException('unauthorized', 'Missing authenticated user.', 401);
    }

    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId: requestContext.workspaceId,
        userId: requestContext.userId,
        status: 'active',
      },
      select: { role: true },
    });

    if (!membership || !roles.includes(membership.role)) {
      throw new ApiException('forbidden', 'Workspace role does not allow this action.', 403, {
        requiredRoles: roles,
      });
    }

    return true;
  }
}
