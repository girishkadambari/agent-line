import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { AuditAction, EventResourceType } from '../../domain/events';
import type { CreateApiKeyInput, UpdateApiKeyInput } from '../../domain/schemas';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { serializeApiKey, serializeCreatedApiKey } from './api-keys.serializer';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
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
      actorUserId: context.userId,
      action: AuditAction.ApiKeyCreated,
      resourceType: EventResourceType.ApiKey,
      resourceId: apiKey.id,
      metadata: { label: apiKey.label, prefix: apiKey.prefix },
    });

    await this.sendSecurityEmail(context, {
      apiKeyId: apiKey.id,
      label: apiKey.label,
      prefix: apiKey.prefix,
      action: 'created',
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
      actorUserId: context.userId,
      action: AuditAction.ApiKeyUpdated,
      resourceType: EventResourceType.ApiKey,
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
      actorUserId: context.userId,
      action: AuditAction.ApiKeyRevoked,
      resourceType: EventResourceType.ApiKey,
      resourceId: apiKey.id,
      metadata: { label: apiKey.label, prefix: apiKey.prefix },
    });

    await this.sendSecurityEmail(context, {
      apiKeyId: apiKey.id,
      label: apiKey.label,
      prefix: apiKey.prefix,
      action: 'revoked',
    });

    return serializeApiKey(apiKey);
  }

  async rotateApiKey(context: RequestContext, id: string) {
    const existing = await this.findApiKeyOrThrow(context, id);

    if (existing.status === 'revoked') {
      throw new ApiException('conflict', 'Revoked API keys cannot be rotated.', 409, { id });
    }

    const rawKey = this.create('sk_test');
    const apiKey = await this.prisma.aPIKey.update({
      where: { id },
      data: {
        prefix: this.prefix(rawKey),
        keyHash: this.hash(rawKey),
        status: 'active',
      },
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      actorUserId: context.userId,
      action: AuditAction.ApiKeyRotated,
      resourceType: EventResourceType.ApiKey,
      resourceId: apiKey.id,
      metadata: {
        label: apiKey.label,
        previousPrefix: existing.prefix,
        prefix: apiKey.prefix,
      },
    });

    await this.sendSecurityEmail(context, {
      apiKeyId: apiKey.id,
      label: apiKey.label,
      prefix: existing.prefix,
      action: 'rotated',
      newPrefix: apiKey.prefix,
    });

    return serializeCreatedApiKey(apiKey, rawKey);
  }

  private async sendSecurityEmail(
    context: RequestContext,
    input: {
      apiKeyId: string;
      label: string;
      prefix: string;
      action: 'created' | 'revoked' | 'rotated';
      newPrefix?: string;
    },
  ) {
    if (!context.userId) {
      return;
    }

    const [user, workspace] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: context.userId }, select: { email: true } }),
      this.prisma.workspace.findUnique({
        where: { id: context.workspaceId },
        select: { name: true },
      }),
    ]);

    if (!user?.email) {
      return;
    }

    await this.email.sendApiKeySecurityEmail({
      workspaceId: context.workspaceId,
      apiKeyId: input.apiKeyId,
      email: user.email,
      workspaceName: workspace?.name ?? 'AgentLine',
      label: input.label,
      prefix: input.prefix,
      action: input.action,
      newPrefix: input.newPrefix,
    });
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
