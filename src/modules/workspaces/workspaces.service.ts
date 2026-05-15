import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type {
  AcceptInviteInput,
  CreateInviteInput,
  CreateWorkspaceInput,
  UpdateMemberInput,
  UpdateWorkspaceInput,
} from '../../domain/schemas';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { createInviteToken, hashInviteToken } from './invite-token.utils';
import { serializeInvite, serializeMember, serializeWorkspace } from './workspaces.serializer';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
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

  async getCurrentWorkspaceSettings(context: RequestContext) {
    const [
      workspace,
      membership,
      projects,
      members,
      pendingInvites,
      billingBalance,
      agents,
      activeNumbers,
      activeWebhooks,
    ] = await Promise.all([
      this.prisma.workspace.findUnique({ where: { id: context.workspaceId } }),
      context.userId
        ? this.prisma.workspaceMember.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId: context.workspaceId,
                userId: context.userId,
              },
            },
          })
        : Promise.resolve(null),
      this.prisma.project.findMany({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.workspaceMember.count({
        where: { workspaceId: context.workspaceId, status: 'active' },
      }),
      this.prisma.workspaceInvite.count({
        where: { workspaceId: context.workspaceId, status: 'pending' },
      }),
      this.prisma.billingBalance.findUnique({ where: { workspaceId: context.workspaceId } }),
      this.prisma.agent.count({
        where: { workspaceId: context.workspaceId, projectId: context.projectId },
      }),
      this.prisma.phoneNumber.count({
        where: { workspaceId: context.workspaceId, projectId: context.projectId, status: 'active' },
      }),
      this.prisma.webhookEndpoint.count({
        where: { workspaceId: context.workspaceId, projectId: context.projectId, status: 'active' },
      }),
    ]);

    if (!workspace) {
      throw new ApiException('not_found', 'Workspace not found.', 404);
    }

    return {
      workspace: serializeWorkspace(workspace),
      currentUserRole: membership?.role ?? null,
      currentProjectId: context.projectId,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        environment: project.environment,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      })),
      counts: {
        activeMembers: members,
        pendingInvites,
        agents,
        activeNumbers,
        activeWebhooks,
      },
      billing: {
        currency: billingBalance?.currency ?? 'USD',
        balanceCents: billingBalance?.balanceCents ?? 0,
        spendLimitCents: billingBalance?.spendLimitCents ?? null,
        prepaidRequired: true,
        lowBalance: (billingBalance?.balanceCents ?? 0) <= 500,
      },
      providers: this.getProviderReadiness(),
      controls: {
        canManageWorkspace: ['owner', 'admin'].includes(membership?.role ?? ''),
        canManageBilling: ['owner', 'admin', 'billing'].includes(membership?.role ?? ''),
        canInviteMembers: ['owner', 'admin'].includes(membership?.role ?? ''),
        canManageApiKeys: ['owner', 'admin', 'developer'].includes(membership?.role ?? ''),
      },
    };
  }

  async listUserWorkspaces(userId: string, limit: number) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: {
        userId,
        status: 'active',
      },
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
      take: limit,
    });

    return list(
      memberships.map((membership) => ({
        ...serializeWorkspace(membership.workspace),
        role: membership.role,
        projects: membership.workspace.projects.map((project) => ({
          id: project.id,
          name: project.name,
          environment: project.environment,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        })),
      })),
      { limit, nextCursor: null },
    );
  }

  async createWorkspaceForUser(userId: string, input: CreateWorkspaceInput) {
    const result = await this.prisma.$transaction(async (tx) => {
      const workspaceId = createId('ws');
      const projectId = createId('proj');
      const workspace = await tx.workspace.create({
        data: {
          id: workspaceId,
          name: input.name,
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
        include: {
          projects: true,
        },
      });

      await tx.workspaceMember.create({
        data: {
          id: createId('mem'),
          workspaceId,
          userId,
          role: 'owner',
          status: 'active',
        },
      });

      return workspace;
    });

    await this.audit.record({
      workspaceId: result.id,
      actorUserId: userId,
      action: 'workspace.created',
      resourceType: 'workspace',
      resourceId: result.id,
      metadata: { name: result.name },
    });
    await this.billing.ensureStripeCustomerForWorkspace(result.id);

    return {
      ...serializeWorkspace(result),
      projects: result.projects.map((project) => ({
        id: project.id,
        name: project.name,
        environment: project.environment,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      })),
    };
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

    return list(
      invites.map((invite) => serializeInvite(invite)),
      { limit, nextCursor: null },
    );
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
      actorUserId: context.userId,
      action: 'invite.created',
      resourceType: 'workspace_invite',
      resourceId: invite.id,
      metadata: { email: invite.email, role: invite.role },
    });

    await this.email.sendWorkspaceInviteEmail({
      workspaceId: context.workspaceId,
      inviteId: invite.id,
      email: invite.email,
      role: invite.role,
      rawToken,
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

    await this.audit.record({
      workspaceId: context.workspaceId,
      actorApiKeyId: context.apiKeyId,
      actorUserId: context.userId,
      action: 'invite.resent',
      resourceType: 'workspace_invite',
      resourceId: invite.id,
      metadata: { email: updated.email, role: updated.role },
    });

    await this.email.sendWorkspaceInviteEmail({
      workspaceId: context.workspaceId,
      inviteId: updated.id,
      email: updated.email,
      role: updated.role,
      rawToken,
    });

    return serializeInvite(updated, rawToken);
  }

  async acceptInvite(userId: string, userEmail: string, input: AcceptInviteInput) {
    const invite = await this.prisma.workspaceInvite.findFirst({
      where: {
        tokenHash: hashInviteToken(input.token),
      },
    });

    if (!invite || invite.status !== 'pending') {
      throw new ApiException('not_found', 'Invite not found.', 404);
    }
    if (invite.expiresAt <= new Date()) {
      await this.prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      throw new ApiException('conflict', 'Invite has expired.', 409, { inviteId: invite.id });
    }
    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ApiException('forbidden', 'Invite belongs to a different email address.', 403);
    }

    const accepted = await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invite.workspaceId,
            userId,
          },
        },
        update: {
          role: invite.role,
          status: 'active',
        },
        create: {
          id: createId('mem'),
          workspaceId: invite.workspaceId,
          userId,
          role: invite.role,
          status: 'active',
        },
      });

      return tx.workspaceInvite.update({
        where: { id: invite.id },
        data: {
          status: 'accepted',
          acceptedById: userId,
          acceptedAt: new Date(),
        },
      });
    });

    await this.audit.record({
      workspaceId: invite.workspaceId,
      actorUserId: userId,
      action: 'invite.accepted',
      resourceType: 'workspace_invite',
      resourceId: invite.id,
      metadata: { email: invite.email, role: invite.role },
    });

    return serializeInvite(accepted);
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

  private getProviderReadiness() {
    const twilioMode = this.config.get<string>('TWILIO_MODE', 'test');
    const twilioLiveReady =
      this.hasConfig('TWILIO_ACCOUNT_SID') && this.hasConfig('TWILIO_AUTH_TOKEN');
    const twilioTestReady =
      this.hasConfig('TWILIO_TEST_ACCOUNT_SID') && this.hasConfig('TWILIO_TEST_AUTH_TOKEN');
    const twilioCallbackReady =
      this.hasConfig('TWILIO_INBOUND_SMS_WEBHOOK_URL') &&
      this.hasConfig('TWILIO_MESSAGE_STATUS_CALLBACK_URL') &&
      this.hasConfig('TWILIO_VOICE_WEBHOOK_URL') &&
      this.hasConfig('TWILIO_VOICE_GATHER_CALLBACK_URL') &&
      this.hasConfig('TWILIO_VOICE_STATUS_CALLBACK_URL');

    return {
      telecom: {
        provider: this.config.get<string>('TELECOM_PROVIDER', 'twilio'),
        mode: twilioMode,
        credentialsReady: twilioMode === 'live' ? twilioLiveReady : twilioTestReady,
        liveCredentialsReady: twilioLiveReady,
        testCredentialsReady: twilioTestReady,
        callbackUrlsReady: twilioCallbackReady,
      },
      stripe: {
        mode: this.config.get<string>('STRIPE_MODE', 'test'),
        secretKeyConfigured: this.hasConfig('STRIPE_SECRET_KEY'),
        webhookSecretConfigured: this.hasConfig('STRIPE_WEBHOOK_SECRET'),
        usageMeterEventNameConfigured: this.hasConfig('STRIPE_USAGE_METER_EVENT_NAME'),
      },
      brevo: {
        apiKeyConfigured: this.hasConfig('BREVO_API_KEY'),
        fromEmailConfigured: this.hasConfig('BREVO_FROM_EMAIL'),
      },
      auth: {
        googleConfigured:
          this.hasConfig('GOOGLE_CLIENT_ID') &&
          this.hasConfig('GOOGLE_CLIENT_SECRET') &&
          this.hasConfig('GOOGLE_REDIRECT_URI'),
      },
    };
  }

  private hasConfig(key: string) {
    const value = this.config.get<string>(key);
    return Boolean(value && value.trim().length > 0);
  }
}
