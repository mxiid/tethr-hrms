// Stable error codes that cross the API boundary. The backend throws typed
// domain errors carrying one of these codes; an exception filter serializes them
// to this shape; the client switches on `code`, never on a message string.

export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'TENANT_CONTEXT_MISSING'
  | 'IMMUTABLE_RECORD'
  | 'EFFECTIVE_DATE_OVERLAP'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export type SerializedDomainError = {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
};
