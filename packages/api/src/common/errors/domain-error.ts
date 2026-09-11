import type { DomainErrorCode, SerializedDomainError } from '@hrms/shared';

// Errors thrown at the service boundary (architecture.md §6.5). They carry a
// stable code from the shared contract; an exception filter maps them to the
// transport. Services throw these — never raw `Error`, never HTTP exceptions.
export abstract class DomainError extends Error {
  protected constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }

  serialize(): SerializedDomainError {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super('NOT_FOUND', message, details);
  }
}

export class ValidationFailedError extends DomainError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super('VALIDATION_FAILED', message, details);
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You do not have permission to perform this action') {
    super('FORBIDDEN', message);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super('CONFLICT', message, details);
  }
}

// Thrown when a query or write runs without a tenant in context — the tenant
// scoping guardrail tripping (non-negotiable: tenancy at the data layer).
export class TenantContextMissingError extends DomainError {
  constructor() {
    super('TENANT_CONTEXT_MISSING', 'No tenant in context; the operation was not tenant-scoped.');
  }
}

// Thrown when an effective-dated write would overlap an existing record.
export class EffectiveDatingError extends DomainError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super('EFFECTIVE_DATE_OVERLAP', message, details);
  }
}
