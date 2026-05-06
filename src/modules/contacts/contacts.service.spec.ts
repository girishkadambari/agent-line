import type { PrismaService } from '../prisma/prisma.service';
import { ContactsService } from './contacts.service';

const context = {
  workspaceId: 'ws_123',
  projectId: 'proj_123',
  apiKeyId: 'key_123',
};

describe('ContactsService', () => {
  it('returns existing contact by phone number', async () => {
    const prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ctc_123', phoneNumber: '+14155550100' }),
      },
    } as unknown as PrismaService;
    const service = new ContactsService(prisma);

    await expect(service.findOrCreateByPhoneNumber(context, '+14155550100')).resolves.toMatchObject({
      id: 'ctc_123',
    });
  });

  it('creates contact when missing', async () => {
    const prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ctc_new', phoneNumber: '+14155550100' }),
      },
    } as unknown as PrismaService;
    const service = new ContactsService(prisma);

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
