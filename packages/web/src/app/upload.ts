// Uploads bytes straight to object storage using an access descriptor minted by
// the API. The browser never sees storage credentials — only a short-lived
// signed URL — and the API's GraphQL body limit never enters the picture.
export type SignedUploadAccess = {
  readonly url: string;
  readonly headers: readonly { readonly name: string; readonly value: string }[];
};

export const uploadToSignedUrl = async (access: SignedUploadAccess, file: File): Promise<void> => {
  const headers: Record<string, string> = {};
  for (const header of access.headers) {
    headers[header.name] = header.value;
  }
  const response = await fetch(access.url, { method: 'PUT', headers, body: file });
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}). The link may have expired.`);
  }
};
