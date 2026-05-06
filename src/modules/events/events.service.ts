import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createId } from '../../common/ids';
import { PrismaService } from '../prisma/prisma.service';
import { serializeInternalEvent } from './events.serializer';

export interface CreateInternalEventInput {
  workspaceId: string;
  projectId: string;
  type: string;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateInternalEventInput) {
    const event = await this.prisma.internalEvent.create({
      data: {
        id: createId('evt'),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        type: input.type,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      },
    });

    return serializeInternalEvent(event);
  }
}
