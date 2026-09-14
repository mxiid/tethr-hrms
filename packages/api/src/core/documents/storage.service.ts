import { Injectable } from '@nestjs/common';

import { ConfigService } from '../config/config.service';

import { LocalStorageDriver } from './local-storage.driver';
import type {
  CreateSignedDownloadInput,
  CreateSignedUploadInput,
  SignedDownload,
  SignedUpload,
  StorageDriver,
} from './storage.driver';
import { SupabaseStorageDriver } from './supabase-storage.driver';

// The one seam business code sees: ask for a signed upload or download, get a
// URL. The driver is chosen once at construction from config, so switching
// from the dev disk driver to Supabase Storage is an environment change, not a
// code change.
@Injectable()
export class StorageService {
  private readonly driver: StorageDriver;
  private readonly driverName: 'local' | 'supabase';

  constructor(config: ConfigService) {
    this.driverName = config.get('STORAGE_DRIVER');
    this.driver =
      this.driverName === 'supabase'
        ? new SupabaseStorageDriver(config)
        : new LocalStorageDriver(config);
  }

  get activeDriver(): 'local' | 'supabase' {
    return this.driverName;
  }

  createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUpload> {
    return this.driver.createSignedUpload(input);
  }

  createSignedDownload(input: CreateSignedDownloadInput): Promise<SignedDownload> {
    return this.driver.createSignedDownload(input);
  }
}
