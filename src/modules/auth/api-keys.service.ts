import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type { CreateApiKeyInput, UpdateApiKeyInput } from '../../domain/schemas';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { serializeApiKey, serializeCreatedApiKey } from './api-keys.serializer';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  hash(apiKey: string) {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  create(prefix = 'sk_test') {
    const token = randomBytes(24).toString('base64url');
    return `${prefix}_${token}`;
  }

  prefix(apiKey: string) {
    const parts = apiKey.split('_');
    if (parts.length < 3) {
      return apiKey.slice(0, 8);
    }

    return `${parts[0]}_${parts[1]}_${parts[2].slice(0, 6)}`;
  }

  async listApiKeys(context: RequestContext, limit: number) {
    const apiKeys = await this.prisma.aPIKey.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return list(apiKeys.map(serializeApiKey), { limit, nextCursor: null });
  }

  async createApiKey(context: RequestContext, input: CreateApiKeyInput) {
    const rawKey = this.create('sk_test');
    const apiKey = await this.prisma.aPIKey.create({
      data: {
        id: createId('key'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        label: input.label,
        prefix: this.prefix(rawKey),
        keyHash: this.hash(rawKey),
        status: 'active',
      },
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      action: 'api_key.created',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      metadata: { label: apiKey.label, prefix: apiKey.prefix },
    });

    return serializeCreatedApiKey(apiKey, rawKey);
  }

  async updateApiKey(context: RequestContext, id: string, input: UpdateApiKeyInput) {
    await this.findApiKeyOrThrow(context, id);

    const apiKey = await this.prisma.aPIKey.update({
      where: { id },
      data: {
        label: input.label,
        status: input.status,
      },
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      action: 'api_key.updated',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      metadata: { label: apiKey.label, status: apiKey.status },
    });

    return serializeApiKey(apiKey);
  }

  async revokeApiKey(context: RequestContext, id: string) {
    const existing = await this.findApiKeyOrThrow(context, id);

    if (existing.status === 'revoked') {
      return serializeApiKey(existing);
    }

    const apiKey = await this.prisma.aPIKey.update({
      where: { id },
      data: { status: 'revoked' },
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      action: 'api_key.revoked',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      metadata: { label: apiKey.label, prefix: apiKey.prefix },
    });

    return serializeApiKey(apiKey);
  }

  private async findApiKeyOrThrow(context: RequestContext, id: string) {
    const apiKey = await this.prisma.aPIKey.findFirst({
      where: {
        id,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
    });

    if (!apiKey) {
      throw new ApiException('not_found', 'API key not found.', 404, { id });
    }

    return apiKey;
  }
}
