import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';

import { parseLimit, success } from '../../common/api/api-response';
import { CurrentContext } from '../../common/context/current-context.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { updateContactSchema } from '../../domain/schemas';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ContactsService } from './contacts.service';

@UseGuards(ApiKeyGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  listContacts(@CurrentContext() context: RequestContext, @Query('limit') limit?: string) {
    return this.contacts.listContacts(context, parseLimit(limit));
  }

  @Get(':id')
  async getContact(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return success(await this.contacts.getContact(context, id));
  }

  @Patch(':id')
  async updateContact(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: unknown,
  ) {
    return success(await this.contacts.updateContact(context, id, updateContactSchema.parse(body)));
  }
}
