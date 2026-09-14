import { createHmac, timingSafeEqual } from 'node:crypto';

// Signing helpers for the local (development-only) storage driver. The signed
// link carries no session meaning: possession grants exactly one action on one
// key until it expires. The signature covers the action, the key, the content
// type and the expiry, so none of them can be swapped.

export type LocalStorageAction = 'upload' | 'download';

export type LocalStorageToken = {
  readonly expiresAtMs: number;
};

const signatureFor = (
  secret: string,
  action: LocalStorageAction,
  storageKey: string,
  contentType: string,
  expiresAtMs: number,
): string =>
  createHmac('sha256', secret)
    .update(`${action}:${storageKey}:${contentType}:${expiresAtMs}`)
    .digest('hex');

export const signLocalStorageToken = (
  secret: string,
  action: LocalStorageAction,
  storageKey: string,
  contentType: string,
  expiresAtMs: number,
): string => `${expiresAtMs}.${signatureFor(secret, action, storageKey, contentType, expiresAtMs)}`;

export const verifyLocalStorageToken = (input: {
  readonly secret: string;
  readonly token: string;
  readonly action: LocalStorageAction;
  readonly storageKey: string;
  readonly contentType: string;
}): LocalStorageToken | null => {
  const separator = input.token.indexOf('.');
  if (separator <= 0) return null;
  const expiresAtMs = Number(input.token.slice(0, separator));
  const provided = input.token.slice(separator + 1);
  if (!Number.isFinite(expiresAtMs) || provided.length === 0) return null;

  const expected = signatureFor(
    input.secret,
    input.action,
    input.storageKey,
    input.contentType,
    expiresAtMs,
  );
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  if (Date.now() > expiresAtMs) return null;
  return { expiresAtMs };
};
