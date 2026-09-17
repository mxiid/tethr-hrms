import type { DomainErrorCode } from '@hrms/shared';
import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { GqlContextType } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

import { DomainError } from './domain-error';


// Only codes that have a DomainError subclass can reach this filter; the
// contract keeps IMMUTABLE_RECORD/INTERNAL_ERROR reserved for later use.
type ThrownDomainErrorCode = Exclude<DomainErrorCode, 'IMMUTABLE_RECORD' | 'INTERNAL_ERROR'>;

const HTTP_STATUS_BY_CODE: Record<ThrownDomainErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  TENANT_CONTEXT_MISSING: 400,
  EFFECTIVE_DATE_OVERLAP: 409,
};

// Minimal shape of the HTTP response — avoids depending on express types here.
type HttpResponseLike = {
  status: (code: number) => { json: (body: unknown) => void };
};

// Maps a thrown DomainError to the right transport response (architecture.md §6.5):
// a GraphQLError with a `code` extension for GraphQL, a JSON body for REST.
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    // Every DomainError subclass passes one of the mapped codes; the cast only
    // excludes the reserved codes that have no class yet.
    const status = HTTP_STATUS_BY_CODE[exception.code as ThrownDomainErrorCode] ?? 500;

    if (host.getType<GqlContextType>() === 'graphql') {
      // Rethrow as a GraphQLError; the GraphQL execution layer surfaces it with
      // a machine-readable `code` the client can switch on.
      throw new GraphQLError(exception.message, {
        extensions: { code: exception.code, status, details: exception.details ?? null },
      });
    }

    const response = host.switchToHttp().getResponse<HttpResponseLike>();
    response.status(status).json(exception.serialize());
  }
}
