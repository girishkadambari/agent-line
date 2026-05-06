import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';

export function applyApiBehavior(app: INestApplication) {
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
    new ZodValidationPipe(),
  );
}
