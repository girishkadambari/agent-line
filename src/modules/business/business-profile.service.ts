import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { createId } from '../../common/ids';
import { ApiException } from '../../common/errors/api.exception';
import { PrismaService } from '../prisma/prisma.service';

export const businessServiceSchema = z.object({
  name: z.string().min(1),
  priceRs: z.number().int().positive(),
  durationMin: z.number().int().positive().default(30),
});

export const createBusinessProfileSchema = z.object({
  businessType: z.string().default('salon'),
  ownerName: z.string().min(1),
  businessName: z.string().min(1),
  ownerPhone: z.string().min(10),
  address: z.string().optional(),
  openTime: z.string().default('09:00'),
  closeTime: z.string().default('22:00'),
  languages: z.array(z.string()).default(['kannada', 'hindi', 'english']),
  services: z.array(businessServiceSchema).min(1),
  googleMapsUrl: z.string().url().optional(),
});

export type CreateBusinessProfileInput = z.infer<typeof createBusinessProfileSchema>;
export type BusinessService = z.infer<typeof businessServiceSchema>;

@Injectable()
export class BusinessProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async createProfile(workspaceId: string, input: CreateBusinessProfileInput) {
    return this.prisma.businessProfile.create({
      data: {
        id: createId('biz'),
        workspaceId,
        businessType: input.businessType,
        ownerName: input.ownerName,
        businessName: input.businessName,
        ownerPhone: input.ownerPhone,
        address: input.address,
        openTime: input.openTime,
        closeTime: input.closeTime,
        languages: input.languages,
        services: input.services,
        googleMapsUrl: input.googleMapsUrl,
      },
    });
  }

  async listByWorkspace(workspaceId: string) {
    return this.prisma.businessProfile.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getProfileByRetellAgentId(retellAgentId: string) {
    const profile = await this.prisma.businessProfile.findUnique({ where: { retellAgentId } });
    if (!profile) {
      throw new ApiException('not_found', 'Business profile not found.', 404, { retellAgentId });
    }
    return profile;
  }

  async getProfileById(id: string) {
    const profile = await this.prisma.businessProfile.findUnique({ where: { id } });
    if (!profile) {
      throw new ApiException('not_found', 'Business profile not found.', 404, { id });
    }
    return profile;
  }

  async updateProfile(id: string, workspaceId: string, input: Partial<Omit<CreateBusinessProfileInput, 'agentId'>>) {
    return this.prisma.businessProfile.update({ where: { id, workspaceId }, data: input });
  }

  async updateRetellIds(id: string, retellAgentId: string, retellLlmId: string) {
    return this.prisma.businessProfile.update({
      where: { id },
      data: { retellAgentId, retellLlmId },
    });
  }

  async updateQueueState(
    id: string,
    state: { isOnBreak?: boolean; breakResumesAt?: Date | null; isFullDay?: boolean },
  ) {
    return this.prisma.businessProfile.update({ where: { id }, data: state });
  }

  async findByOwnerPhone(phone: string) {
    const normalized = phone.replace(/\D/g, '').slice(-10);
    return this.prisma.businessProfile.findFirst({
      where: { ownerPhone: { endsWith: normalized } },
    });
  }

  findServiceByName(services: BusinessService[], name: string): BusinessService | undefined {
    const normalized = name.toLowerCase().trim();
    return services.find(
      (s) =>
        s.name.toLowerCase().includes(normalized) ||
        normalized.includes(s.name.toLowerCase()),
    );
  }
}
