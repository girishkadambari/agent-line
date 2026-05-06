import type { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

const now = new Date('2026-05-06T00:00:00.000Z');

describe('EventsService', () => {
  it('creates durable internal events for future webhook delivery', async () => {
    const prisma = {
      internalEvent: {
        create: jest.fn().mockResolvedValue({
          id: 'evt_123',
          workspaceId: 'ws_123',
          projectId: 'proj_123',
          type: 'agent.message.sent',
          resourceType: 'message',
          resourceId: 'msg_123',
          payload: {},
          createdAt: now,
        }),
      },
    } as unknown as PrismaService;
    const service = new EventsService(prisma);

    const event = await service.create({
      workspaceId: 'ws_123',
      projectId: 'proj_123',
      type: 'agent.message.sent',
      resourceType: 'message',
      resourceId: 'msg_123',
    });

    expect(event.type).toBe('agent.message.sent');
  });
});
