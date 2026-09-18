import { AsyncLocalStorage } from 'node:async_hooks';

import type { OrganizationId, UserId } from '@hrms/shared';
import { Injectable } from '@nestjs/common';

import { TenantContextMissingError } from '../../common/errors';


type TenantContext = {
  readonly organizationId: OrganizationId;
  readonly userId: UserId | null;
};

// Holds the current tenant for the duration of a request using AsyncLocalStorage,
// so it propagates across async boundaries without being threaded through every
// function. Repositories read it to scope every query (plan.md §6).
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  // Run `callback` (and everything it awaits) with `context` as the active tenant.
  run<TResult>(context: TenantContext, callback: () => TResult): TResult {
    return this.storage.run(context, callback);
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
}
