import 'reflect-metadata';
import 'dotenv/config';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/errors/domain-exception.filter';
import { ConfigService } from './core/config/config.service';
import { parseCorsOrigins } from './core/security/cors';

// Data-URL image uploads (employee photos, invoice branding) run well past
// Express's default 100kb body limit, so the default parser is disabled and
// replaced with one sized for a base64 image (see the 600_000-char caps on
// those inputs).
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  const config = app.get(ConfigService);

  // Security headers. The API serves JSON/GraphQL and (in dev) local storage
  // bytes; cross-origin resource policy is relaxed so the SPA can still load
  // API-served media while helmet's other headers apply everywhere.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Run onModuleDestroy on SIGTERM/SIGINT so the shared PDF browser is closed
  // gracefully instead of being orphaned on redeploy.
  app.enableShutdownHooks();

  // CORS is an explicit allowlist (CORS_ORIGINS); unset keeps the Vite dev
  // origins in development and production refuses to boot without it.
  app.enableCors({
    origin: parseCorsOrigins(config.get('CORS_ORIGINS'), config.get('NODE_ENV')),
    credentials: true,
  });

  // Validate every boundary input; strip unknown fields; reject extras.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // Map domain errors to the right transport response.
  app.useGlobalFilters(new DomainExceptionFilter());

  const port = config.get('PORT');
  await app.listen(port);
  Logger.log(
    `HRMS API ready at http://localhost:${port}/graphql (Node ${process.version})`,
    'Bootstrap',
  );
}

void bootstrap();
