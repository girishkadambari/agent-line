import type { PrismaService } from '../prisma/prisma.service';
import { ContactsService } from './contacts.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

describe('ContactsService', () => {
  function createService(prisma: PrismaService) {
    return new ContactsService(
      prisma,
      { create: jest.fn().mockResolvedValue({ id: 'evt_123' }) } as never,
      { createDeliveriesForEvent: jest.fn().mockResolvedValue([]) } as never,
    );
  }

  it('lists contacts with activity counts', async () => {
    const prisma = {
      contact: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ctc_123',
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            phoneNumber: '+14155550100',
            displayName: 'Ada',
            metadata: {},
            createdAt: new Date('2026-05-07T00:00:00.000Z'),
            updatedAt: new Date('2026-05-07T00:00:00.000Z'),
            _count: { conversations: 2, messages: 5, calls: 1 },
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = createService(prisma);

    await expect(service.listContacts(context, 50)).resolves.toMatchObject({
      data: [
        {
          id: 'ctc_123',
          counts: { conversations: 2, messages: 5, calls: 1 },
        },
      ],
    });
  });

  it('updates a contact display name', async () => {
    const prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ctc_123' }),
        update: jest.fn().mockResolvedValue({
          id: 'ctc_123',
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          phoneNumber: '+14155550100',
          displayName: 'Ada Lovelace',
          metadata: {},
          createdAt: new Date('2026-05-07T00:00:00.000Z'),
          updatedAt: new Date('2026-05-07T00:00:00.000Z'),
          _count: { conversations: 0, messages: 0, calls: 0 },
        }),
      },
    } as unknown as PrismaService;
    const service = createService(prisma);

    await expect(
      service.updateContact(context, 'ctc_123', { displayName: 'Ada Lovelace' }),
    ).resolves.toMatchObject({
      id: 'ctc_123',
      displayName: 'Ada Lovelace',
    });
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ctc_123' },
        data: { displayName: 'Ada Lovelace', metadata: undefined },
      }),
    );
  });

  it('returns existing contact by phone number', async () => {
    const prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ctc_123', phoneNumber: '+14155550100' }),
      },
    } as unknown as PrismaService;
    const service = createService(prisma);

    await expect(service.findOrCreateByPhoneNumber(context, '+14155550100')).resolves.toMatchObject(
      {
        id: 'ctc_123',
      },
    );
  });

  it('creates contact when missing', async () => {
    const prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'ctc_new',
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          phoneNumber: '+14155550100',
          displayName: null,
          metadata: {},
          createdAt: new Date('2026-05-07T00:00:00.000Z'),
          updatedAt: new Date('2026-05-07T00:00:00.000Z'),
        }),
      },
    } as unknown as PrismaService;
    const service = createService(prisma);

    const contact = await service.findOrCreateByPhoneNumber(context, '+14155550100');

    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        phoneNumber: '+14155550100',
      }),
    });
    expect(contact.id).toBe('ctc_new');
  });
});
