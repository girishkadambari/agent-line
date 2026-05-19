import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';

function corsOrigins(config: ConfigService) {
  const configured = config.get<string>('CORS_ORIGINS')?.trim();
  if (configured) {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  const dashboardUrl = config.get<string>('DASHBOARD_URL')?.trim();
  if (dashboardUrl) {
    return [dashboardUrl];
  }

  return config.get<string>('APP_ENV') === 'local' ? ['http://localhost:5173'] : [];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const allowedOrigins = corsOrigins(config);

  app.use(helmet());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
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

  await app.listen(port);
}

void bootstrap();
