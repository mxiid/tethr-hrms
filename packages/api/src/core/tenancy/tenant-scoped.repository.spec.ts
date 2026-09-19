import { toId, type OrganizationId } from '@hrms/shared';
import type { Repository } from 'typeorm';

import type { TenantScopedEntity } from '../database/entities/tenant-scoped.entity';

import { TenantContextService } from './tenant-context.service';
import { TenantScopedRepository } from './tenant-scoped.repository';


type Row = TenantScopedEntity & { name: string };

const ORG_A = toId<OrganizationId>('11111111-1111-1111-1111-111111111111');
const ORG_B = toId<OrganizationId>('22222222-2222-2222-2222-222222222222');

const makeMockRepository = (): Repository<Row> =>
  ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  }) as unknown as Repository<Row>;

describe('TenantScopedRepository', () => {
  let context: TenantContextService;
  let repository: Repository<Row>;
  let scoped: TenantScopedRepository<Row>;

  beforeEach(() => {
    context = new TenantContextService();
    repository = makeMockRepository();
    scoped = new TenantScopedRepository<Row>(repository, context);
  });

  it('injects the current tenant into find()', async () => {
    await context.run({ organizationId: ORG_A, userId: null }, () =>
      scoped.find({ where: { name: 'x' } as never }),
    );
    expect(repository.find).toHaveBeenCalledWith({ where: { name: 'x', organizationId: ORG_A } });
  });

  it('scopes findById to the tenant', async () => {
    await context.run({ organizationId: ORG_A, userId: null }, () => scoped.findById('row-1'));
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'row-1', organizationId: ORG_A },
    });
  });

  it('scopes deleteById to the tenant by predicate', async () => {
    await context.run({ organizationId: ORG_A, userId: null }, () => scoped.deleteById('row-1'));
    expect(repository.delete).toHaveBeenCalledWith({ id: 'row-1', organizationId: ORG_A });
  });

  it('stamps the tenant on save()', async () => {
    await context.run({ organizationId: ORG_A, userId: null }, () =>
      scoped.save({ name: 'x' } as never),
    );
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG_A }));
  });

  it('blocks a write carrying a different tenant id', () => {
    expect(() =>
      context.run({ organizationId: ORG_A, userId: null }, () =>
        scoped.save({ organizationId: ORG_B } as never),
      ),
    ).toThrow(/Cross-tenant/);
  });

  it('fails loudly when no tenant context is established', () => {
    expect(() => scoped.find()).toThrow(/tenant/i);
  });
});
