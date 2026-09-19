import { EventEmitter } from 'node:events';
import { createReadStream, existsSync } from 'node:fs';

import type { Response } from 'express';

import type { ConfigService } from '../config/config.service';

import { LocalStorageController } from './local-storage.controller';
import { encodeLocalStorageKey } from './local-storage.driver';
import { signLocalStorageToken } from './local-storage.signing';

jest.mock('node:fs', () => ({
  ...jest.requireActual<typeof import('node:fs')>('node:fs'),
  createReadStream: jest.fn(),
  existsSync: jest.fn(),
}));

const SECRET = 'test-secret-that-is-at-least-32-characters';
const STORAGE_KEY = 'documents/2026-09-18/contract.pdf';
const CONTENT_TYPE = 'application/pdf';

const createReadStreamMock = createReadStream as unknown as jest.Mock;
const existsSyncMock = existsSync as unknown as jest.Mock;

type FakeReadStream = EventEmitter & { pipe: jest.Mock };

const buildStream = (): FakeReadStream => {
  const stream = new EventEmitter() as FakeReadStream;
  stream.pipe = jest.fn();
  return stream;
};

const buildResponse = () => {
  const response = {
    headersSent: false,
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
    destroy: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

const buildController = (): LocalStorageController =>
  new LocalStorageController({
    get: jest.fn((key: string) => (key === 'STORAGE_DRIVER' ? 'local' : SECRET)),
  } as unknown as ConfigService);

const downloadToken = (): string =>
  signLocalStorageToken(SECRET, 'download', STORAGE_KEY, CONTENT_TYPE, Date.now() + 60_000);

describe('LocalStorageController download', () => {
  beforeEach(() => {
    createReadStreamMock.mockReset();
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(true);
  });

  it('destroys the socket when the read stream fails after headers are sent', () => {
    const stream = buildStream();
    createReadStreamMock.mockReturnValue(stream);
    const response = buildResponse();
    response.headersSent = true;

    buildController().download(
      encodeLocalStorageKey(STORAGE_KEY),
      CONTENT_TYPE,
      downloadToken(),
      response as unknown as Response,
    );

    expect(() => stream.emit('error', new Error('disk gone'))).not.toThrow();
    expect(response.destroy).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('answers 500 when the read stream fails before headers are sent', () => {
    const stream = buildStream();
    createReadStreamMock.mockReturnValue(stream);
    const response = buildResponse();

    buildController().download(
      encodeLocalStorageKey(STORAGE_KEY),
      CONTENT_TYPE,
      downloadToken(),
      response as unknown as Response,
    );

    stream.emit('error', new Error('disk gone'));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: 'Object could not be read' });
    expect(response.destroy).not.toHaveBeenCalled();
  });
});
