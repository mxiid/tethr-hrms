import type { OrganizationId } from '@hrms/shared';
import type {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';

import { ForbiddenError } from '../../common/errors';
import type { TenantScopedEntity } from '../database/entities/tenant-scoped.entity';

import type { TenantContextService } from './tenant-context.service';

// Wraps a TypeORM repository and forces the current tenant into every read and
// write. Domain services depend on this instead of the raw repository, so a
// query physically cannot be issued without a tenant filter (plan.md §6,
// "tenancy at the data layer — code cannot forget to scope"). The `as` casts are
// the narrow ORM escape hatch TypeORM's generics require, not a loosening of the
// contract.
export class TenantScopedRepository<TEntity extends TenantScopedEntity> {
  constructor(
    private readonly repository: Repository<TEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  private currentTenantId(): OrganizationId {
    return this.tenantContext.getOrganizationId();
  }

  private mergeWhere(
    where: FindManyOptions<TEntity>['where'],
  ): FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[] {
    const scope = { organizationId: this.currentTenantId() } as FindOptionsWhere<TEntity>;
    if (where === undefined) return scope;
    if (Array.isArray(where)) return where.map((clause) => ({ ...clause, ...scope }));
    return { ...where, ...scope };
  }

  find(options: FindManyOptions<TEntity> = {}): Promise<TEntity[]> {
    return this.repository.find({ ...options, where: this.mergeWhere(options.where) });
  }

  findOne(options: FindOneOptions<TEntity>): Promise<TEntity | null> {
    return this.repository.findOne({ ...options, where: this.mergeWhere(options.where) });
  }

  findById(id: string): Promise<TEntity | null> {
    return this.repository.findOne({
      where: { id, organizationId: this.currentTenantId() } as FindOptionsWhere<TEntity>,
    });
  }

  count(options: FindManyOptions<TEntity> = {}): Promise<number> {
    return this.repository.count({ ...options, where: this.mergeWhere(options.where) });
  }

  // Build (but do not persist) a new entity already stamped with the tenant.
  create(data: DeepPartial<TEntity>): TEntity {
    return this.repository.create({
      ...data,
      organizationId: this.currentTenantId(),
    } as DeepPartial<TEntity>);
  }

  // Delete by primary key within the current tenant. The tenant predicate is
  // part of the DELETE itself, so a cross-tenant id can never match a row even
  // if the caller skipped its own scoped read (no TOCTOU window).
  deleteById(id: string): Promise<void> {
    return this.repository
      .delete({ id, organizationId: this.currentTenantId() } as FindOptionsWhere<TEntity>)
      .then(() => undefined);
  }

  // Persist, forcing the current tenant. Refuses a write carrying a different
  // tenant's id — defense in depth against a cross-tenant leak.
  save(entity: DeepPartial<TEntity>): Promise<TEntity> {
    const tenantId = this.currentTenantId();
    const incoming = (entity as { organizationId?: OrganizationId }).organizationId;
    if (incoming !== undefined && incoming !== tenantId) {
      throw new ForbiddenError('Cross-tenant write blocked');
    }
    return this.repository.save({ ...entity, organizationId: tenantId } as DeepPartial<TEntity>);
  }

  // Escape hatch for queries the wrapper does not cover (query builder, joins).
  // The caller takes responsibility for scoping — use sparingly, scope explicitly.
  get unsafeRepository(): Repository<TEntity> {
    return this.repository;
  }
}
