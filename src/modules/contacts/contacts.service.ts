import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { list } from '../../common/api/api-response';
import type { RequestContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { createId } from '../../common/ids';
import type { UpdateContactInput } from '../../domain/schemas';
import { PrismaService } from '../prisma/prisma.service';
import { serializeContact } from './contacts.serializer';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.contact.create({
      data: {
        id: createId('ctc'),
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        phoneNumber,
      },
    });
  }

  serialize = serializeContact;

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
}
