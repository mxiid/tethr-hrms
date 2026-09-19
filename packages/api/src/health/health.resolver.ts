import { Query, Resolver } from '@nestjs/graphql';

import { Public } from '../core/authz/public.decorator';

// Guarantees the GraphQL schema always has at least one root query, and serves as
// a liveness probe.
@Resolver()
export class HealthResolver {
  @Query(() => String, { description: 'Liveness probe — returns "ok".' })
  @Public()
  health(): string {
    return 'ok';
  }
}
