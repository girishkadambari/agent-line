import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createContactSchema, updateContactSchema } from '../../domain/schemas';
import { AuthContextGuard } from '../auth/auth-context.guard';
import { AllowApiKeyAuth } from '../auth/api-key-auth.decorator';
import { CsrfGuard } from '../auth/csrf.guard';
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard';
import { WorkspaceRoles } from '../auth/workspace-roles.decorator';
import { ContactsService } from './contacts.service';

@UseGuards(AuthContextGuard, CsrfGuard, WorkspaceRoleGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  listContacts(
    @CurrentContext() context: RequestContext,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.contacts.listContacts(context, parseLimit(limit), { search, cursor });
  }

  @Post()
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async createContact(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createContactSchema)) body: unknown,
  ) {
    return success(await this.contacts.createContact(context, createContactSchema.parse(body)));
  }

  @Get(':id')
  async getContact(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.contacts.getContact(context, id));
  }

  @Patch(':id')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async updateContact(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: unknown,
  ) {
    return success(await this.contacts.updateContact(context, id, updateContactSchema.parse(body)));
  }

  @Delete(':id')
  @AllowApiKeyAuth()
  @WorkspaceRoles('owner', 'admin', 'developer')
  async deleteContact(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.contacts.deleteContact(context, id));
  }
}
