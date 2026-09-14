import type { TaxSlabGroupId } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type FindOptionsWhere } from 'typeorm';

import { NotFoundError, ValidationFailedError } from '../../../common/errors';
import { AuditService } from '../../../core/audit/audit.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';

import { TaxSlab, TaxSlabGroup } from './entities/tax-slab.entity';
import { TAX_SLAB_GROUP_REPOSITORY, TAX_SLAB_REPOSITORY } from './payroll.tokens';
import type { TaxSlabInput } from './tax/calculator';

type CreateTaxSlabGroupData = {
  readonly name: string;
  readonly financialYearLabel: string;
  readonly currency?: string;
};

// One ladder row as submitted by finance. upperBound null marks the open top band
// and is only valid on the last row.
type ReplaceTaxSlabData = {
  readonly upperBound: number | null;
  readonly ratePercent: number;
  readonly flatAdditive: number;
};

const normalizeCurrency = (value: string): string => value.trim().toUpperCase();

// Tenant-owned progressive tax configuration. Exactly one group is active at a
// time; activating a group deactivates the rest inside one transaction.
@Injectable()
export class TaxSlabService {
  constructor(
    @Inject(TAX_SLAB_GROUP_REPOSITORY)
    private readonly groups: TenantScopedRepository<TaxSlabGroup>,
    @Inject(TAX_SLAB_REPOSITORY) private readonly slabs: TenantScopedRepository<TaxSlab>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  async createGroup(input: CreateTaxSlabGroupData): Promise<TaxSlabGroup> {
    const currency = normalizeCurrency(input.currency ?? 'PKR');
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationFailedError('currency must be a 3-letter ISO code');
    }
    const group = await this.groups.save(
      this.groups.create({
        name: input.name,
        financialYearLabel: input.financialYearLabel,
        currency,
        isActive: false,
      }),
    );
    await this.audit.record({
      action: 'create',
      resourceType: 'tax_slab_group',
      resourceId: group.id,
      after: { name: group.name, financialYearLabel: group.financialYearLabel },
    });
    return group;
  }

  listGroups(): Promise<TaxSlabGroup[]> {
    return this.groups.find({ order: { financialYearLabel: 'DESC', createdAt: 'DESC' } });
  }

  listSlabs(groupId: TaxSlabGroupId): Promise<TaxSlab[]> {
    return this.slabs.find({
      where: { groupId } as FindOptionsWhere<TaxSlab>,
      order: { sortOrder: 'ASC', upperBound: 'ASC' },
    });
  }

  // Replace the whole ladder. Rows are validated as an ascending band list with
  // exactly one open top band (upperBound null, last position).
  async replaceSlabs(
    groupId: TaxSlabGroupId,
    entries: readonly ReplaceTaxSlabData[],
  ): Promise<TaxSlab[]> {
    if (!(await this.groups.findById(groupId))) {
      throw new NotFoundError('Tax slab group not found', { id: groupId });
    }
    if (entries.length === 0) {
      throw new ValidationFailedError('A tax slab ladder needs at least one band');
    }
    let previousUpper: number | null = null;
    entries.forEach((entry, index) => {
      const isOpenTop = entry.upperBound === null;
      if (isOpenTop && index !== entries.length - 1) {
        throw new ValidationFailedError('Only the last band may be open-ended', { index });
      }
      if (!isOpenTop) {
        if (entry.upperBound <= 0) {
          throw new ValidationFailedError('upperBound must be positive', { index });
        }
        if (previousUpper !== null && entry.upperBound <= previousUpper) {
          throw new ValidationFailedError('Band upper bounds must be strictly increasing', {
            index,
          });
        }
        previousUpper = entry.upperBound;
      }
      if (entry.ratePercent < 0 || entry.ratePercent > 100) {
        throw new ValidationFailedError('ratePercent must be within [0, 100]', { index });
      }
      if (entry.flatAdditive < 0) {
        throw new ValidationFailedError('flatAdditive must be zero or greater', { index });
      }
    });
    const last = entries[entries.length - 1];
    if (last.upperBound !== null) {
      throw new ValidationFailedError('The final band must be open-ended (upperBound omitted)');
    }

    const organizationId = this.tenantContext.getOrganizationId();
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.find(TaxSlab, {
        where: { organizationId, groupId } as FindOptionsWhere<TaxSlab>,
      });
      for (const row of existing) {
        await manager.remove(row);
      }
      const persisted: TaxSlab[] = [];
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const row = manager.create(TaxSlab, {
          organizationId,
          groupId,
          sortOrder: index,
          upperBound: entry.upperBound === null ? null : entry.upperBound.toFixed(2),
          ratePercent: entry.ratePercent.toFixed(4),
          flatAdditive: entry.flatAdditive.toFixed(2),
        });
        persisted.push(await manager.save(row));
      }
      return persisted;
    });
  }

  async activateGroup(groupId: string): Promise<TaxSlabGroup> {
    const organizationId = this.tenantContext.getOrganizationId();
    const activated = await this.dataSource.transaction(async (manager) => {
      const target = await manager.findOne(TaxSlabGroup, { where: { id: groupId, organizationId } });
      if (!target) {
        throw new NotFoundError('Tax slab group not found', { id: groupId });
      }
      const others = await manager.find(TaxSlabGroup, {
        where: { organizationId, isActive: true } as FindOptionsWhere<TaxSlabGroup>,
      });
      for (const group of others) {
        group.isActive = false;
        await manager.save(group);
      }
      target.isActive = true;
      return manager.save(target);
    });
    await this.audit.record({
      action: 'activate',
      resourceType: 'tax_slab_group',
      resourceId: groupId,
      after: { name: activated.name },
    });
    return activated;
  }

  // The ladder the payroll engine uses for a draft: the active group's bands as
  // plain numbers. Null when no group is active — runs then compute zero tax
  // until finance configures and activates one (visible, never guessed).
  async getActiveLadder(): Promise<TaxSlabInput[] | null> {
    const active = await this.groups.findOne({ where: { isActive: true } });
    if (!active) {
      return null;
    }
    const rows = await this.listSlabs(active.id as TaxSlabGroupId);
    return rows.map((row) => ({
      upperBound: row.upperBound === null ? null : Number(row.upperBound),
      ratePercent: Number(row.ratePercent),
      flatAdditive: Number(row.flatAdditive),
    }));
  }
}
