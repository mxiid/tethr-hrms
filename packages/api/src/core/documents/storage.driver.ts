// Object storage is wrapped behind one interface, the way the queue is
// (architecture.md §4): business code asks for a signed transfer, it never
// knows whether the bytes land in Supabase Storage or on local disk. The
// production driver is Supabase; the local driver exists so development can
// exercise the real PUT/GET flow before a bucket is provisioned.

export type StorageAccessHeader = {
  readonly name: string;
  readonly value: string;
};

export type SignedUpload = {
  readonly storageKey: string;
  readonly url: string;
  readonly method: 'PUT';
  readonly headers: readonly StorageAccessHeader[];
  readonly expiresAt: Date;
};

export type SignedDownload = {
  readonly storageKey: string;
  readonly url: string;
  readonly expiresAt: Date;
};

export type CreateSignedUploadInput = {
  readonly storageKey: string;
  readonly contentType: string;
};

export type CreateSignedDownloadInput = {
  readonly storageKey: string;
  readonly contentType: string;
};

export interface StorageDriver {
  createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUpload>;
  createSignedDownload(input: CreateSignedDownloadInput): Promise<SignedDownload>;
}
