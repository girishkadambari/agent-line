import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type { RequestWithContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from './api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & RequestWithContext>();
    const apiKey = this.readBearerToken(request);

    if (!apiKey) {
      throw new ApiException('unauthorized', 'Missing API key.', 401);
    }

    const keyHash = this.apiKeys.hash(apiKey);
    const record = await this.prisma.aPIKey.findFirst({
      where: {
        keyHash,
        status: 'active',
      },
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
      },
    });

    if (!record) {
      throw new ApiException('unauthorized', 'Invalid API key.', 401);
    }

    request.agentLineContext = {
      workspaceId: record.workspaceId,
      projectId: record.projectId,
      authType: 'api_key',
      apiKeyId: record.id,
    };

    await this.prisma.aPIKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });

    return true;
  }

  private readBearerToken(request: Request) {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }
}
