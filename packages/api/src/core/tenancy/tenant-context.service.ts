import { AsyncLocalStorage } from 'node:async_hooks';

import type { OrganizationId, UserId } from '@hrms/shared';
import { Injectable } from '@nestjs/common';

import { TenantContextMissingError } from '../../common/errors';


type TenantContext = {
  readonly organizationId: OrganizationId;
  readonly userId: UserId | null;
  // Session epoch from the JWT, when the context was established from one.
  // Absent for system/consumer runs and pre-tokenVersion tokens.
  readonly tokenVersion?: number;
};

type TenantContextStore = TenantContext & {
  // Per-request cache shared by every consumer of the context (session
  // validation, authorization lookups). Scoped to the AsyncLocalStorage store,
  // so it lives exactly as long as the request — never shared across requests.
  readonly memo: Map<string, unknown>;
};

// Holds the current tenant for the duration of a request using AsyncLocalStorage,
// so it propagates across async boundaries without being threaded through every
// function. Repositories read it to scope every query (plan.md §6).
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContextStore>();

  // Run `callback` (and everything it awaits) with `context` as the active tenant.
  run<TResult>(context: TenantContext, callback: () => TResult): TResult {
    return this.storage.run({ ...context, memo: new Map() }, callback);
  }

  // Memoize an async read for the remainder of this request. Callers on the
  // same request share one underlying query; outside a context the factory
  // simply runs uncached (login resolves access before any tenant exists).
  async memo<TResult>(key: string, factory: () => Promise<TResult>): Promise<TResult> {
    const context = this.storage.getStore();
    if (!context) {
      return factory();
    }
    if (context.memo.has(key)) {
      return context.memo.get(key) as TResult;
    }
    const value = await factory();
    context.memo.set(key, value);
    return value;
  }

  getContextOrNull(): TenantContext | null {
    return this.storage.getStore() ?? null;
  }

  // The organization id, or a typed error if the operation was not scoped. The
  // guardrail: forgetting to establish context fails loudly, it does not silently
  // read across tenants.
  getOrganizationId(): OrganizationId {
    const context = this.storage.getStore();
    if (!context) {
      throw new TenantContextMissingError();
    }
    return context.organizationId;
  }

  getUserId(): UserId | null {
    return this.storage.getStore()?.userId ?? null;
  }

  getTokenVersion(): number | undefined {
    return this.storage.getStore()?.tokenVersion;
  }
}
