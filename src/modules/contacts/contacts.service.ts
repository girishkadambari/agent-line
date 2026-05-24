import { Injectable } from '@nestjs/common';
import { Prisma, type Contact } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import { VukhoEvent, EventResourceType } from '../../domain/events';
import type { CreateContactInput, UpdateContactInput } from '../../domain/schemas';
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

  async listContacts(
    context: RequestContext,
    limit: number,
    filters: { search?: string; cursor?: string } = {},
  ) {
    const where: Prisma.ContactWhereInput = {
      workspaceId: context.workspaceId,
      projectId: context.projectId,
    };

    if (filters.search) {
      where.OR = [
        { phoneNumber: { contains: filters.search, mode: 'insensitive' } },
        { displayName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const contacts = await this.prisma.contact.findMany({
      where,
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
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    const hasMore = contacts.length > limit;
    const page = hasMore ? contacts.slice(0, limit) : contacts;

    return list(page.map(serializeContact), {
      limit,
      hasMore,
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    });
  }

  /**
   * Create or upsert a contact by phoneNumber.
   * If a contact with the same phoneNumber already exists in the project, it is updated
   * with the supplied displayName and metadata (partial update — omitted fields are left as-is).
   */
  async createContact(context: RequestContext, input: CreateContactInput) {
    const contactId = createId('ctc');

    const contact = await this.prisma.contact
      .create({
        data: {
          id: contactId,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          phoneNumber: input.phoneNumber,
          displayName: input.displayName ?? null,
          metadata: input.metadata as Prisma.InputJsonValue,
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
      })
      .catch(async (error) => {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }

        // Upsert: update existing contact's display name and metadata.
        return this.prisma.contact.update({
          where: {
            projectId_phoneNumber: {
              projectId: context.projectId,
              phoneNumber: input.phoneNumber,
            },
          },
          data: {
            displayName: input.displayName !== undefined ? input.displayName : undefined,
            metadata:
              input.metadata && Object.keys(input.metadata).length > 0
                ? (input.metadata as Prisma.InputJsonValue)
                : undefined,
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
      });

    if (contact.id === contactId) {
      // New contact — emit created event.
      await this.emitContactEvent(context, VukhoEvent.ContactCreated, contact);
    } else {
      // Existing contact was updated.
      await this.emitContactEvent(context, VukhoEvent.ContactUpdated, contact);
    }

    return serializeContact(contact);
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

  async deleteContact(context: RequestContext, id: string) {
    await this.findContactOrThrow(context, id);

    await this.prisma.contact.delete({ where: { id } });

    return { id, deleted: true };
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
