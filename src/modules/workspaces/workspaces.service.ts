import { Injectable } from '@nestjs/common';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type { CreateInviteInput, UpdateMemberInput, UpdateWorkspaceInput } from '../../domain/schemas';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { createInviteToken, hashInviteToken } from './invite-token.utils';
import { serializeInvite, serializeMember, serializeWorkspace } from './workspaces.serializer';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getCurrentWorkspace(context: RequestContext) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: context.workspaceId },
    });

    if (!workspace) {
      throw new ApiException('not_found', 'Workspace not found.', 404);
    }

    return serializeWorkspace(workspace);
  }

  async updateCurrentWorkspace(context: RequestContext, input: UpdateWorkspaceInput) {
    const workspace = await this.prisma.workspace.update({
      where: { id: context.workspaceId },
      data: input,
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: workspace.id,
      metadata: input,
    });

    return serializeWorkspace(workspace);
  }

  async listMembers(context: RequestContext, limit: number) {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: context.workspaceId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return list(members.map(serializeMember), { limit, nextCursor: null });
  }

  async updateMember(context: RequestContext, memberId: string, input: UpdateMemberInput) {
    const member = await this.findMemberOrThrow(context, memberId);

    if (member.role === 'owner' && input.role && input.role !== 'owner') {
      await this.assertAnotherActiveOwner(context, memberId);
    }

    const updated = await this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: input,
      include: { user: true },
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      action: 'member.role_updated',
      resourceType: 'workspace_member',
      resourceId: memberId,
      metadata: input as Record<string, unknown>,
    });

    return serializeMember(updated);
  }

  async removeMember(context: RequestContext, memberId: string) {
    const member = await this.findMemberOrThrow(context, memberId);

    if (member.role === 'owner') {
      await this.assertAnotherActiveOwner(context, memberId);
    }

    const updated = await this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { status: 'removed' },
      include: { user: true },
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      action: 'member.removed',
      resourceType: 'workspace_member',
      resourceId: memberId,
    });

    return serializeMember(updated);
  }

  async listInvites(context: RequestContext, limit: number) {
    const invites = await this.prisma.workspaceInvite.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return list(invites.map((invite) => serializeInvite(invite)), { limit, nextCursor: null });
  }

  async createInvite(context: RequestContext, input: CreateInviteInput) {
    const rawToken = createInviteToken();
    const invite = await this.prisma.workspaceInvite.create({
      data: {
        id: createId('inv'),
        workspaceId: context.workspaceId,
        email: input.email.toLowerCase(),
        role: input.role,
        tokenHash: hashInviteToken(rawToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      action: 'invite.created',
      resourceType: 'workspace_invite',
      resourceId: invite.id,
      metadata: { email: invite.email, role: invite.role },
    });

    return serializeInvite(invite, rawToken);
  }

  async revokeInvite(context: RequestContext, inviteId: string) {
    const invite = await this.findInviteOrThrow(context, inviteId);
    const updated = await this.prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: {
        status: 'revoked',
        revokedAt: new Date(),
      },
    });

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      action: 'invite.revoked',
      resourceType: 'workspace_invite',
      resourceId: invite.id,
    });

    return serializeInvite(updated);
  }

  async resendInvite(context: RequestContext, inviteId: string) {
    const invite = await this.findInviteOrThrow(context, inviteId);
    if (invite.status !== 'pending') {
      throw new ApiException('conflict', 'Only pending invites can be resent.', 409, { inviteId });
    }

    const rawToken = createInviteToken();
    const updated = await this.prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: {
        tokenHash: hashInviteToken(rawToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return serializeInvite(updated, rawToken);
  }

  private async findMemberOrThrow(context: RequestContext, memberId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspaceId: context.workspaceId,
      },
    });

    if (!member) {
      throw new ApiException('not_found', 'Workspace member not found.', 404, { memberId });
    }

    return member;
  }

  private async findInviteOrThrow(context: RequestContext, inviteId: string) {
    const invite = await this.prisma.workspaceInvite.findFirst({
      where: {
        id: inviteId,
        workspaceId: context.workspaceId,
      },
    });

    if (!invite) {
      throw new ApiException('not_found', 'Workspace invite not found.', 404, { inviteId });
    }

    return invite;
  }

  private async assertAnotherActiveOwner(context: RequestContext, memberId: string) {
    const owners = await this.prisma.workspaceMember.count({
      where: {
        workspaceId: context.workspaceId,
        role: 'owner',
        status: 'active',
        id: { not: memberId },
      },
    });

    if (owners < 1) {
      throw new ApiException('conflict', 'Workspace must keep at least one active owner.', 409, {
        memberId,
      });
    }
  }
}
