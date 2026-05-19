import { Injectable } from '@nestjs/common';
import { Prisma, type Contact } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { VukhoEvent, EventResourceType } from '../../domain/events';
import type { UpdateContactInput } from '../../domain/schemas';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { serializeContact } from './contacts.serializer';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly webhooks: WebhooksService,
  ) {}

  async listContacts(context: RequestContext, limit: number) {
    const contacts = await this.prisma.contact.findMany({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
      include: {
        _count: {
          select: {
            conversations: true,
            messages: true,
            calls: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return list(contacts.map(serializeContact), { limit, nextCursor: null });
  }

  async getContact(context: RequestContext, id: string) {
    return serializeContact(await this.findContactOrThrow(context, id));
  }

  async updateContact(context: RequestContext, id: string, input: UpdateContactInput) {
    await this.findContactOrThrow(context, id);

    const contact = await this.prisma.contact.update({
      where: { id },
      data: {
        displayName: input.displayName,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      include: {
        _count: {
          select: {
            conversations: true,
            messages: true,
            calls: true,
          },
        },
      },
    });

    await this.emitContactEvent(context, VukhoEvent.ContactUpdated, contact);

    return serializeContact(contact);
  }

  async findOrCreateByPhoneNumber(context: RequestContext, phoneNumber: string) {
    const existing = await this.prisma.contact.findFirst({
      where: {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        phoneNumber,
      },
    });

    if (existing) {
      return existing;
    }

    const contactId = createId('ctc');
    const contact = await this.prisma.contact
      .create({
        data: {
          id: contactId,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          phoneNumber,
        },
      })
      .catch(async (error) => {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }

        return this.prisma.contact.findUniqueOrThrow({
          where: {
            projectId_phoneNumber: {
              projectId: context.projectId,
              phoneNumber,
            },
          },
        });
      });

    if (contact.id !== contactId) {
      return contact;
    }

    await this.emitContactEvent(context, VukhoEvent.ContactCreated, contact);

    return contact;
  }

  serialize = serializeContact;

  private async emitContactEvent(context: RequestContext, type: string, contact: Contact) {
    const event = await this.events.create({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type,
      resourceType: EventResourceType.Contact,
      resourceId: contact.id,
      payload: {
        contactId: contact.id,
        phoneNumber: contact.phoneNumber,
        displayName: contact.displayName,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
      },
    });
    await this.webhooks.createDeliveriesForEvent(event);
  }

  private async findContactOrThrow(context: RequestContext, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      },
      include: {
        _count: {
          select: {
            conversations: true,
            messages: true,
            calls: true,
          },
        },
      },
    });

    if (!contact) {
      throw new ApiException('not_found', 'Contact not found.', 404, { id });
    }

    return contact;
  }

  private isUniqueConstraintError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
