import 'reflect-metadata';
import 'dotenv/config';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';

import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/errors/domain-exception.filter';
import { ConfigService } from './core/config/config.service';

// Data-URL image uploads (employee photos, invoice branding) run well past
// Express's default 100kb body limit, so the default parser is disabled and
// replaced with one sized for a base64 image (see the 600_000-char caps on
// those inputs).
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // Dev-permissive CORS so the Vite SPA (:5173) can call the API (:3000).
  app.enableCors({ origin: true, credentials: true });

  // Validate every boundary input; strip unknown fields; reject extras.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // Map domain errors to the right transport response.
  app.useGlobalFilters(new DomainExceptionFilter());

  const config = app.get(ConfigService);
  const port = config.get('PORT');
  await app.listen(port);
  Logger.log(
    `HRMS API ready at http://localhost:${port}/graphql (Node ${process.version})`,
    'Bootstrap',
  );
}

void bootstrap();
