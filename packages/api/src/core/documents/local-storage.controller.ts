import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Controller, Get, Logger, NotFoundException, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { Public } from '../authz/public.decorator';
import { ConfigService } from '../config/config.service';

import {
  decodeLocalStorageKey,
  resolveLocalStoragePath,
} from './local-storage.driver';
import { verifyLocalStorageToken } from './local-storage.signing';

// The API's first REST controller: the dev storage driver's byte transfer.
// Deliberately tiny — PUT streams one object to disk under a signed link, GET
// streams it back. Every route 404s unless STORAGE_DRIVER=local, and config
// validation already refuses that driver in production. @Public() records that
// every route does its own signed-token check instead of a session check.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

@Controller('storage/local')
@Public()
export class LocalStorageController {
  private readonly logger = new Logger(LocalStorageController.name);

  constructor(private readonly config: ConfigService) {}

  @Put('upload')
  async upload(
    @Query('key') encodedKey: string | undefined,
    @Query('token') token: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    this.assertEnabled();
    const storageKey = decodeLocalStorageKey(encodedKey);
    const contentType = singleHeader(request.headers['content-type']) ?? '';
    const verified =
      storageKey !== null &&
      verifyLocalStorageToken({
        secret: this.secret(),
        token: token ?? '',
        action: 'upload',
        storageKey,
        contentType,
      });
    if (!verified) {
      response.status(401).json({ error: 'Invalid or expired upload link' });
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of request) {
      const buffer = chunk as Buffer;
      total += buffer.length;
      if (total > MAX_UPLOAD_BYTES) {
        response.status(413).json({ error: 'Upload exceeds the maximum size' });
        return;
      }
      chunks.push(buffer);
    }

    const filePath = resolveLocalStoragePath(storageKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.concat(chunks));
    response.status(200).json({ storageKey, sizeBytes: total });
  }

  @Get('download')
  download(
    @Query('key') encodedKey: string | undefined,
    @Query('contentType') contentType: string | undefined,
    @Query('token') token: string | undefined,
    @Res() response: Response,
  ): void {
    this.assertEnabled();
    const storageKey = decodeLocalStorageKey(encodedKey);
    const verified =
      storageKey !== null &&
      verifyLocalStorageToken({
        secret: this.secret(),
        token: token ?? '',
        action: 'download',
        storageKey,
        contentType: contentType ?? '',
      });
    if (!verified) {
      response.status(401).json({ error: 'Invalid or expired download link' });
      return;
    }

    const filePath = resolveLocalStoragePath(storageKey);
    if (!existsSync(filePath)) {
      response.status(404).json({ error: 'Object not found' });
      return;
    }
    response.setHeader('Content-Type', contentType || 'application/octet-stream');
    response.setHeader('Cache-Control', 'private, max-age=0, no-store');
    const stream = createReadStream(filePath);
    // A read error after the headers are sent cannot become a JSON response;
    // without this listener the stream's unhandled 'error' event would crash
    // the process. Log it and tear the socket down instead.
    stream.on('error', (error: Error) => {
      this.logger.error(`Local download failed for ${storageKey}: ${error.message}`);
      if (!response.headersSent) {
        response.status(500).json({ error: 'Object could not be read' });
      } else {
        response.destroy();
      }
    });
    stream.pipe(response);
  }

  private assertEnabled(): void {
    if (this.config.get('STORAGE_DRIVER') !== 'local') {
      throw new NotFoundException();
    }
  }

  private secret(): string {
    return this.config.get('JWT_SECRET');
  }
}

const singleHeader = (value: string | string[] | undefined): string | null => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return null;
};
