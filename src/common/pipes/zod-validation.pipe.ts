import { Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

import { ApiException } from '../errors/api.exception';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema?: ZodSchema) {}

  transform(value: unknown) {
    if (!this.schema) {
      return value;
    }

    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiException('invalid_request', 'Request validation failed.', 400, {
        issues: result.error.issues,
      });
    }

    return result.data;
  }
}
