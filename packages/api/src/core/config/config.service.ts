import { Injectable } from '@nestjs/common';

import { loadConfig, type AppConfig } from './config.schema';

// Wraps validated config. Application code reads `configService.get('PORT')`,
// never `process.env.PORT` directly (architecture.md §12).
@Injectable()
export class ConfigService {
  private readonly config: AppConfig;

  constructor() {
    this.config = loadConfig();
  }

  get<TKey extends keyof AppConfig>(key: TKey): AppConfig[TKey] {
    return this.config[key];
  }

  get isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }
}
