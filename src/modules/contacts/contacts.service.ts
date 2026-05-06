import { Injectable } from '@nestjs/common';

import type { RequestContext } from '../../common/context/request-context';
import { createId } from '../../common/ids';
import { PrismaService } from '../prisma/prisma.service';
import { serializeContact } from './contacts.serializer';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
