import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailDeliveryStatus } from '@prisma/client';
import { createHash } from 'crypto';

import { createId } from '../../common/ids';
import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { BrevoEmailError, BrevoEmailProvider } from './brevo-email.provider';
import { serializeEmailDelivery } from './email.serializer';
import { renderWorkspaceInviteEmail } from './email.templates';
import type { WorkspaceInviteEmailInput } from './email.types';

@Injectable()
export class EmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly brevo: BrevoEmailProvider,
  ) {}

  async listDeliveries(
    context: RequestContext,
    input: { limit: number; status?: string; template?: string; recipientEmail?: string },
  ) {
    const status = this.parseDeliveryStatus(input.status);
    const deliveries = await this.prisma.emailDelivery.findMany({
      where: {
        workspaceId: context.workspaceId,
        ...(status ? { status } : {}),
        ...(input.template ? { template: input.template } : {}),
        ...(input.recipientEmail ? { recipientEmail: input.recipientEmail.toLowerCase() } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });

    return list(deliveries.map(serializeEmailDelivery), { limit: input.limit, nextCursor: null });
  }

  async sendWorkspaceInviteEmail(input: WorkspaceInviteEmailInput) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { name: true },
    });
    const dashboardUrl = this.config.get<string>('DASHBOARD_URL') || 'http://localhost:8080';
    const email = renderWorkspaceInviteEmail({
      dashboardUrl,
      workspaceName: workspace?.name ?? 'AgentLine',
      role: input.role,
      token: input.rawToken,
    });
    const idempotencyKey = `workspace_invite:${input.inviteId}:${this.hashTokenFingerprint(input.rawToken)}`;
    const metadata = {
      inviteId: input.inviteId,
      role: input.role,
      dashboardUrl,
    };

    const existing = await this.prisma.emailDelivery.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    const delivery = await this.prisma.emailDelivery.create({
      data: {
        id: createId('eml'),
        workspaceId: input.workspaceId,
        recipientEmail: input.email,
        template: 'workspace_invite',
        subject: email.subject,
        status: this.brevo.isConfigured() ? 'queued' : 'skipped',
        provider: this.brevo.isConfigured() ? 'brevo' : null,
        idempotencyKey,
        metadata,
        errorCode: this.brevo.isConfigured() ? null : 'provider_not_configured',
        errorMessage: this.brevo.isConfigured() ? null : 'BREVO_API_KEY and BREVO_FROM_EMAIL are not configured.',
      },
    });

    if (!this.brevo.isConfigured()) {
      return delivery;
    }

    try {
      const result = await this.brevo.send({
        to: input.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      return this.prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'sent',
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      return this.prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          errorCode: this.getErrorCode(error),
          errorMessage: error instanceof Error ? error.message : 'Email send failed.',
          failedAt: new Date(),
        },
      });
    }
  }

  private hashTokenFingerprint(token: string) {
    return createHash('sha256').update(token).digest('hex').slice(0, 24);
  }

  private getErrorCode(error: unknown) {
    if (error instanceof BrevoEmailError) {
      const code = error.body.code;
      return typeof code === 'string' ? code : `http_${error.status}`;
    }

    return 'email_send_failed';
  }

  private parseDeliveryStatus(status: string | undefined) {
    if (!status) {
      return undefined;
    }

    const allowed = [
      EmailDeliveryStatus.queued,
      EmailDeliveryStatus.sent,
      EmailDeliveryStatus.failed,
      EmailDeliveryStatus.skipped,
    ] as const;
    if (allowed.some((allowedStatus) => allowedStatus === status)) {
      return status as EmailDeliveryStatus;
    }

    throw new ApiException('invalid_request', 'Invalid email delivery status.', 400, {
      status,
      allowed,
    });
  }
}
