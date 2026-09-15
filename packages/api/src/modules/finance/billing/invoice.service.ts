import {
  addIsoDays,
  compareIsoDate,
  rangesOverlap,
  toId,
  type BillingGroupId,
  type EmployeeId,
  type InvoiceId,
  type InvoiceLineKind,
  type IsoDate,
  type PayrollRunId,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  IsNull,
  Not,
  type EntityManager,
  type FindOptionsWhere,
} from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../../common/errors';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEventPublisher } from '../../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';
import { EmployeeDirectoryService } from '../../employee';
import { FxService } from '../fx/fx.service';
import { PayrollRunService, type RunBillingSummary } from '../payroll';

import { BILLING_GROUP_MEMBER_REPOSITORY, BILLING_GROUP_REPOSITORY, BILLING_PERIOD_CLOSE_REPOSITORY, CLIENT_BILLING_CONFIG_REPOSITORY, INVOICE_LINE_REPOSITORY, INVOICE_REPOSITORY, PAYROLL_COST_SNAPSHOT_REPOSITORY } from './billing.tokens';
import { BillingGroupMember } from './entities/billing-group-member.entity';
import { BillingGroup } from './entities/billing-group.entity';
import { BillingPeriodClose } from './entities/billing-period-close.entity';
import { ClientBillingConfig } from './entities/client-billing-config.entity';
import { InvoiceLine } from './entities/invoice-line.entity';
import { Invoice } from './entities/invoice.entity';
import { PayrollCostSnapshot } from './entities/payroll-cost-snapshot.entity';
import { addMonths, monthLabel as formatMonthLabel, parseMonthLabel, prorationShare, proratedAmount } from './month-math';
 type UpdateBillingConfigData = {
  readonly feeAmount?: number;
  readonly paymentTermsNetDays?: number;
  readonly anchorDay?: number;
  readonly receiverName?: string | null;
  readonly receiverAddress?: string | null;
  readonly receiverEmail?: string | null;
  readonly receiverZipCode?: string | null;
  readonly receiverCity?: string | null;
  readonly receiverCountry?: string | null;
  readonly receiverPhone?: string | null;
  readonly senderZipCode?: string | null;
  readonly senderCity?: string | null;
  readonly senderCountry?: string | null;
  readonly invoiceLogoDataUrl?: string | null;
  readonly signatureDataUrl?: string | null;
  readonly senderName?: string | null;
  readonly senderAddress?: string | null;
  readonly senderEmail?: string | null;
  readonly senderPhone?: string | null;
  readonly bankName?: string | null;
  readonly bankAccountName?: string | null;
  readonly bankAccountNumber?: string | null;
  readonly bankSwift?: string | null;
};
 type CreateBillingGroupData = {
  readonly name: string;
  readonly servicesPrefix: string;
  readonly expensesPrefix: string;
};
 type SetBillingMemberData = {
  readonly employeeId: EmployeeId;
  readonly groupId: BillingGroupId;
  readonly monthlyRate: number;
};
 type AddInvoiceLineData = {
  readonly description?: string;
  readonly quantity?: number;
  readonly unitPrice: number;
  readonly kind?: InvoiceLineKind;
  readonly employeeId?: EmployeeId | null;
  readonly monthLabel?: string | null;
};
 type UpdateInvoiceLineData = {
  readonly lineId: string;
  readonly description?: string;
  readonly quantity?: number;
  readonly unitPrice?: number;
};
 type MarkInvoicePaidData = {
  readonly invoiceId: InvoiceId;
  readonly paymentReference?: string | null;
  readonly settlementDate?: IsoDate | null;
};

export type InvoiceDetail = {
  readonly invoice: Invoice;
  readonly lines: readonly InvoiceLine[];
};

// The reconciliation board row: one service month, what was invoiced in salary
// terms, and the frozen payroll cost once a covering run finalizes.
export type ReconciliationPeriod = {
  readonly serviceYear: number;
  readonly serviceMonth: number;
  readonly status: 'open' | 'balanced' | 'variance' | 'no_cost_data';
  readonly currency: string;
  readonly invoiceCount: number;
  readonly invoicedAmount: number;
  readonly payrollCostAmount: number | null;
  readonly varianceAmount: number | null;
  readonly payrollRunId: string | null;
  readonly payDate: IsoDate | null;
  readonly invoices: readonly { readonly invoice: Invoice; readonly invoicedAmount: number }[];
};
 type ClientCostBreakdown = {
  readonly totalBilled: number;
  readonly currency: string;
  readonly byEmployee: readonly {
    readonly employeeId: EmployeeId;
    readonly employeeName: string | null;
    readonly total: number;
  }[];
  readonly byPeriod: readonly {
    readonly serviceYear: number;
    readonly serviceMonth: number;
    readonly total: number;
  }[];
};

// A line pending persistence during auto-drafting — plain data, no base-entity
// noise.
type PendingLine = {
  readonly kind: InvoiceLineKind;
  readonly employeeId: EmployeeId | null;
  readonly employeeName: string | null;
  readonly monthLabel: string | null;
  readonly description: string;
  readonly unitPrice: number;
};

const toMoneyString = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);
const round2 = (value: number): number => Math.round(value * 100) / 100;
const pad2 = (value: number): string => String(value).padStart(2, '0');
const pad4 = (value: number): string => String(value).padStart(4, '0');

// Billing and payroll prorate differently by design (billing counts Mon–Fri,
// payroll holidays-aware), so a small delta is expected. Beyond 2% of cost (or
// $1, whichever is greater) the invoice is flagged for finance review.
const RECONCILIATION_TOLERANCE_PERCENT = 0.02;
const RECONCILIATION_TOLERANCE_MIN = 1;
const withinTolerance = (invoiced: number, cost: number): boolean =>
  Math.abs(invoiced - cost) <= Math.max(RECONCILIATION_TOLERANCE_MIN, cost * RECONCILIATION_TOLERANCE_PERCENT);

// Postgres unique_violation, as surfaced by TypeORM's QueryFailedError.
const isUniqueViolation = (cause: unknown): boolean => {
  const driverError = (cause as { readonly driverError?: { readonly code?: string } }).driverError;
  return driverError?.code === '23505';
};

const todayIso = (): IsoDate => new Date().toISOString().slice(0, 10);

// [anchor day of `year-month`, anchor day of the next month) — the billing
// window printed on documents, mirroring the sheet's 20th → 19th convention.
const anchoredWindow = (
  year: number,
  month: number,
  anchorDay: number,
): { start: IsoDate; endExclusive: IsoDate } => {
  const next = addMonths(year, month, 1);
  return {
    start: `${year}-${pad2(month)}-${pad2(anchorDay)}`,
    endExclusive: `${next.year}-${pad2(next.month)}-${pad2(anchorDay)}`,
  };
};

// Owns the Tethr → client billing domain. Services invoices are drafted
// automatically from a finalized payroll run (the event consumer calls into
// this service); expenses invoices are opened manually. Everything money-shaped
// on an issued invoice is frozen — corrections ride later documents.
@Injectable()
export class InvoiceService {
  constructor(
    @Inject(CLIENT_BILLING_CONFIG_REPOSITORY)
    private readonly configs: TenantScopedRepository<ClientBillingConfig>,
    @Inject(BILLING_GROUP_REPOSITORY)
    private readonly groups: TenantScopedRepository<BillingGroup>,
    @Inject(BILLING_GROUP_MEMBER_REPOSITORY)
    private readonly members: TenantScopedRepository<BillingGroupMember>,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoices: TenantScopedRepository<Invoice>,
    @Inject(INVOICE_LINE_REPOSITORY)
    private readonly lines: TenantScopedRepository<InvoiceLine>,
    @Inject(PAYROLL_COST_SNAPSHOT_REPOSITORY)
    private readonly costSnapshots: TenantScopedRepository<PayrollCostSnapshot>,
    @Inject(BILLING_PERIOD_CLOSE_REPOSITORY)
    private readonly periodCloses: TenantScopedRepository<BillingPeriodClose>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly publisher: DomainEventPublisher,
    private readonly audit: AuditService,
    private readonly employeeDirectory: EmployeeDirectoryService,
    private readonly payrollRuns: PayrollRunService,
    private readonly fx: FxService,
  ) {}

  // Injectable clock for deterministic tests; production always uses real time.
  nowProvider: () => Date = () => new Date();

  // --- Configuration ---

  async getConfig(): Promise<ClientBillingConfig> {
    const existing = await this.configs.findOne({});
    if (existing) {
      return existing;
    }
    return this.configs.save(
      this.configs.create({
        feeAmount: '300.00',
        feeCurrency: 'USD',
        paymentTermsNetDays: 7,
        anchorDay: 20,
      }),
    );
  }

  async updateConfig(input: UpdateBillingConfigData): Promise<ClientBillingConfig> {
    if (input.anchorDay != null && (input.anchorDay < 1 || input.anchorDay > 28)) {
      throw new ValidationFailedError('anchorDay must be between 1 and 28');
    }
    if (input.paymentTermsNetDays != null && input.paymentTermsNetDays < 0) {
      throw new ValidationFailedError('paymentTermsNetDays must be zero or greater');
    }
    if (input.feeAmount != null && input.feeAmount < 0) {
      throw new ValidationFailedError('feeAmount must be zero or greater');
    }
    const config = await this.getConfig();
    if (input.feeAmount !== undefined && input.feeAmount !== null) {
      config.feeAmount = toMoneyString(input.feeAmount);
    }
    if (input.paymentTermsNetDays != null) {
      config.paymentTermsNetDays = input.paymentTermsNetDays;
    }
    if (input.anchorDay != null) {
      config.anchorDay = input.anchorDay;
    }
    const nullableTextFields = [
      'receiverName', 'receiverAddress', 'receiverEmail', 'receiverPhone',
      'receiverZipCode', 'receiverCity', 'receiverCountry',
      'senderZipCode', 'senderCity', 'senderCountry',
      'invoiceLogoDataUrl', 'signatureDataUrl',
      'senderName', 'senderAddress', 'senderEmail', 'senderPhone',
      'bankName', 'bankAccountName', 'bankAccountNumber', 'bankSwift',
    ] as const;
    for (const field of nullableTextFields) {
      if (input[field] !== undefined) {
        config[field] = input[field] ?? null;
      }
    }
    const saved = await this.configs.save(config);
    await this.audit.record({
      action: 'update',
      resourceType: 'client_billing_config',
      resourceId: saved.id,
      after: { feeAmount: Number(saved.feeAmount), anchorDay: saved.anchorDay },
    });
    return saved;
  }

  // --- Groups & members ---

  async createGroup(input: CreateBillingGroupData): Promise<BillingGroup> {
    const name = input.name.trim();
    if (name.length < 1) {
      throw new ValidationFailedError('name is required');
    }
    if (!/^[A-Za-z]{1,8}$/.test(input.servicesPrefix.trim()) || !/^[A-Za-z]{1,8}$/.test(input.expensesPrefix.trim())) {
      throw new ValidationFailedError('prefixes must be 1-8 letters');
    }
    const group = await this.groups.save(
      this.groups.create({
        name,
        servicesPrefix: input.servicesPrefix.trim().toUpperCase(),
        expensesPrefix: input.expensesPrefix.trim().toUpperCase(),
      }),
    );
    await this.audit.record({
      action: 'create',
      resourceType: 'billing_group',
      resourceId: group.id,
      after: { name: group.name },
    });
    return group;
  }

  listGroups(): Promise<BillingGroup[]> {
    return this.groups.find({ order: { name: 'ASC' } });
  }

  // Opening a membership is an effective-dated act: the current open row is
  // closed on the day the new one starts, and the new row carries the new group
  // and rate. A repeated call with identical group+rate is a no-op. The first
  // membership for an employee starts at their hire date so catch-up billing
  // still reaches back to the beginning of their employment.
  async setMember(input: SetBillingMemberData): Promise<BillingGroupMember> {
    if (!(await this.groups.findById(input.groupId))) {
      throw new NotFoundError('Billing group not found', { id: input.groupId });
    }
    const employee = await this.employeeDirectory.getById(input.employeeId);
    if (!employee) {
      throw new NotFoundError('Employee not found', { id: input.employeeId });
    }
    if (input.monthlyRate < 0) {
      throw new ValidationFailedError('monthlyRate must be zero or greater');
    }
    const organizationId = this.tenantContext.getOrganizationId();
    const today = todayIso();
    const config = await this.getConfig();
    const open = await this.members.findOne({
      where: { employeeId: input.employeeId, validTo: IsNull() } as FindOptionsWhere<BillingGroupMember>,
      order: { validFrom: 'DESC' },
    });
    if (
      open &&
      open.groupId === input.groupId &&
      Number(open.monthlyRate) === input.monthlyRate
    ) {
      return open;
    }
    const anyExisting = await this.members.findOne({
      where: { employeeId: input.employeeId } as FindOptionsWhere<BillingGroupMember>,
      order: { validFrom: 'ASC' },
    });
    const validFrom = anyExisting ? today : employee.hireDate;
    // Service-level overlap guard mirroring AssignmentService: no two membership
    // ranges may share a day. The DB partial unique index (one open row per
    // employee) is the race-proof backstop; this gives the clean error first.
    const history = await this.members.find({
      where: { employeeId: input.employeeId } as FindOptionsWhere<BillingGroupMember>,
    });
    const conflict = history.find(
      (member) =>
        member.id !== open?.id &&
        rangesOverlap(
          { validFrom: member.validFrom, validTo: member.validTo },
          { validFrom, validTo: null },
        ),
    );
    if (conflict) {
      throw new ConflictError('A billing membership already covers this period', {
        employeeId: input.employeeId,
        conflictingMembershipId: conflict.id,
      });
    }
    const payloadGroupId = input.groupId;
    const payloadRate = toMoneyString(input.monthlyRate);
    const saved = await this.dataSource.transaction(async (manager) => {
      if (open) {
        // Half-open ranges: the old row ends the moment the new one begins.
        open.validTo = validFrom;
        await manager.save(open);
      }
      return manager.save(
        manager.create(BillingGroupMember, {
          organizationId,
          employeeId: input.employeeId,
          groupId: payloadGroupId,
          monthlyRate: payloadRate,
          // Billing rates are quoted in the client's billing currency; the
          // invoice currency (config.feeCurrency) is the only one the drafter
          // can add up, so memberships follow it.
          rateCurrency: config.feeCurrency,
          validFrom,
          validTo: null,
        }),
      );
    });
    await this.markDraftsStaleForEmployee(
      input.employeeId,
      'Rate or group changed after this draft was created',
    );
    await this.audit.record({
      action: 'setMember',
      resourceType: 'billing_group_member',
      resourceId: saved.id,
      after: { groupId: saved.groupId, monthlyRate: Number(saved.monthlyRate), validFrom },
    });
    return saved;
  }

  // Removal closes the open membership rather than deleting it, so the record of
  // prior billing stays intact and the drafter can still see (and is stopped by)
  // the closed range. Billing pro-rates the final month through the close date.
  async removeMember(employeeId: EmployeeId): Promise<void> {
    const open = await this.members.findOne({
      where: { employeeId, validTo: IsNull() } as FindOptionsWhere<BillingGroupMember>,
    });
    if (!open) {
      throw new NotFoundError('Billing group membership not found', { employeeId });
    }
    open.validTo = todayIso();
    await this.members.save(open);
    await this.markDraftsStaleForEmployee(
      employeeId,
      'Membership closed after this draft was created',
    );
    await this.audit.record({
      action: 'removeMember',
      resourceType: 'billing_group_member',
      resourceId: open.id,
      before: { employeeId },
      after: { validTo: open.validTo },
    });
  }

  // Published write for the `employee.terminated` consumer: stop billing after
  // the employee's last working day. No-op when there is no open membership.
  async closeMembershipAt(employeeId: EmployeeId, lastCoveredDate: IsoDate): Promise<void> {
    const open = await this.members.findOne({
      where: { employeeId, validTo: IsNull() } as FindOptionsWhere<BillingGroupMember>,
    });
    if (!open) {
      return;
    }
    // validTo is exclusive: cover through the last day, stop the next day. Never
    // end a membership before it started.
    const exclusiveEnd = addIsoDays(lastCoveredDate, 1);
    open.validTo =
      compareIsoDate(exclusiveEnd, open.validFrom) < 0 ? open.validFrom : exclusiveEnd;
    await this.members.save(open);
    await this.audit.record({
      action: 'closeMembership',
      resourceType: 'billing_group_member',
      resourceId: open.id,
      after: { employeeId, validTo: open.validTo },
    });
  }

  // Current memberships only (open ranges). History is reachable through the
  // membership rows themselves for billing, not the admin list.
  listMembers(groupId?: BillingGroupId): Promise<BillingGroupMember[]> {
    const where = groupId
      ? { groupId, validTo: IsNull() }
      : { validTo: IsNull() };
    return this.members.find({
      where: where as FindOptionsWhere<BillingGroupMember>,
      order: { validFrom: 'ASC' },
    });
  }

  // --- Invoices ---

  listInvoices(): Promise<Invoice[]> {
    return this.invoices.find({
      order: { serviceYear: 'DESC', serviceMonth: 'DESC', createdAt: 'DESC' },
    });
  }

  // Client-portal read path: issued and paid documents only, never drafts.
  listVisibleInvoices(): Promise<Invoice[]> {
    return this.invoices.find({
      where: { status: In(['issued', 'paid']) } as FindOptionsWhere<Invoice>,
      order: { serviceYear: 'DESC', serviceMonth: 'DESC', createdAt: 'DESC' },
    });
  }

  // Client-portal aggregate (plan Phase 4 #28): per-employee cost and a spend
  // trend across issued/paid invoices — the data that previously existed only
  // inside the downloadable addendum PDF.
  async getClientCostBreakdown(): Promise<ClientCostBreakdown> {
    const invoices = await this.listVisibleInvoices();
    const byEmployee = new Map<string, { employeeId: EmployeeId; employeeName: string | null; total: number }>();
    const byPeriod = new Map<string, { serviceYear: number; serviceMonth: number; total: number }>();
    let total = 0;
    for (const invoice of invoices) {
      const lines = await this.lines.find({
        where: { invoiceId: invoice.id } as FindOptionsWhere<InvoiceLine>,
      });
      for (const line of lines) {
        const amount = Number(line.total);
        total += amount;
        if (line.employeeId) {
          const key = line.employeeId as string;
          const existing =
            byEmployee.get(key) ?? { employeeId: line.employeeId, employeeName: line.employeeName, total: 0 };
          existing.total += amount;
          if (!existing.employeeName && line.employeeName) {
            existing.employeeName = line.employeeName;
          }
          byEmployee.set(key, existing);
        }
        const periodKey = `${invoice.serviceYear}-${invoice.serviceMonth}`;
        const period =
          byPeriod.get(periodKey) ??
          { serviceYear: invoice.serviceYear, serviceMonth: invoice.serviceMonth, total: 0 };
        period.total += amount;
        byPeriod.set(periodKey, period);
      }
    }
    return {
      totalBilled: round2(total),
      currency: invoices[0]?.currency ?? 'USD',
      byEmployee: [...byEmployee.values()]
        .map((entry) => ({ ...entry, total: round2(entry.total) }))
        .sort((a, b) => b.total - a.total),
      byPeriod: [...byPeriod.values()]
        .map((entry) => ({ ...entry, total: round2(entry.total) }))
        .sort((a, b) =>
          a.serviceYear === b.serviceYear
            ? a.serviceMonth - b.serviceMonth
            : a.serviceYear - b.serviceYear,
        ),
    };
  }

  async getInvoiceDetail(invoiceId: InvoiceId): Promise<InvoiceDetail> {
    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found', { id: invoiceId });
    }
    const lines = await this.lines.find({
      where: { invoiceId } as FindOptionsWhere<InvoiceLine>,
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return { invoice, lines };
  }

  // Freeze the run's cost facts into the billing currency at the rate of the
  // pay date. Idempotent per run (unique index); a replay never rewrites the
  // rate or the converted amount, so a later FX edit cannot restate history.
  private async recordCostSnapshot(
    summary: RunBillingSummary,
    config: ClientBillingConfig,
  ): Promise<PayrollCostSnapshot> {
    const existing = await this.costSnapshots.findOne({
      where: { payrollRunId: summary.runId } as FindOptionsWhere<PayrollCostSnapshot>,
    });
    if (existing) {
      return existing;
    }
    const billingCurrency = config.feeCurrency;
    const fxRate = await this.fx.getRate(summary.payrollCurrency, billingCurrency, summary.payDate);
    return this.costSnapshots.save(
      this.costSnapshots.create({
        payrollRunId: summary.runId,
        periodYear: summary.periodYear,
        periodMonth: summary.periodMonth,
        payDate: summary.payDate,
        payrollCurrency: summary.payrollCurrency,
        billingCurrency,
        fxRate: fxRate === null ? null : fxRate.toFixed(8),
        grossTotal: toMoneyString(summary.grossTotal),
        employerCostTotal: toMoneyString(summary.employerCostTotal),
        convertedEmployerCost:
          fxRate === null ? null : toMoneyString(summary.employerCostTotal * fxRate),
        employeeCosts: summary.payslips.map((payslip) => ({
          employeeId: payslip.employeeId,
          grossAmount: payslip.grossAmount,
          employerCostAmount: payslip.employerCostAmount,
        })),
      }),
    );
  }

  // Compare what was billed for the run's own month against the month's actual
  // cost, then record the period close. Lines are matched by their month label,
  // not their invoice's service month, because a catch-up line for August can
  // ride September's document — the cost of August belongs to August's close.
  private async reconcileServiceMonth(
    summary: RunBillingSummary,
    snapshot: PayrollCostSnapshot,
  ): Promise<void> {
    const label = formatMonthLabel(summary.periodYear, summary.periodMonth);
    const monthLines = await this.lines.find({
      where: {
        monthLabel: label,
        kind: In(['salary', 'catchup'] as InvoiceLineKind[]),
      } as FindOptionsWhere<InvoiceLine>,
    });
    if (monthLines.length === 0) {
      // Nothing billable remains for the month (all documents voided): the close
      // would otherwise keep describing documents that no longer exist.
      await this.removePeriodClose(summary.periodYear, summary.periodMonth);
      return;
    }
    const invoiceIds = [...new Set(monthLines.map((line) => line.invoiceId))];
    const invoicesForMonth = await this.invoices.find({
      where: {
        id: In(invoiceIds),
        type: 'services',
        status: Not('voided'),
      } as FindOptionsWhere<Invoice>,
    });
    if (invoicesForMonth.length === 0) {
      await this.removePeriodClose(summary.periodYear, summary.periodMonth);
      return;
    }
    const validInvoiceIds = new Set(invoicesForMonth.map((invoice) => invoice.id));
    const billableLines = monthLines.filter((line) => validInvoiceIds.has(line.invoiceId));

    const costByEmployee = new Map(
      snapshot.employeeCosts.map((row) => [row.employeeId, row.employerCostAmount]),
    );
    const rate = snapshot.fxRate === null ? null : Number(snapshot.fxRate);
    const now = new Date();

    let totalInvoiced = 0;
    for (const invoice of invoicesForMonth) {
      const invoiceLines = billableLines.filter((line) => line.invoiceId === invoice.id);
      const invoiced = round2(invoiceLines.reduce((sum, line) => sum + Number(line.total), 0));
      const rawCost = invoiceLines.reduce(
        (sum, line) => sum + (line.employeeId ? (costByEmployee.get(line.employeeId) ?? 0) : 0),
        0,
      );
      const convertedCost = rate === null ? null : round2(rawCost * rate);
      invoice.reconciliationStatus =
        convertedCost === null
          ? 'no_cost_data'
          : withinTolerance(invoiced, convertedCost)
            ? 'matched'
            : 'variance';
      invoice.payrollCostAmount = convertedCost === null ? null : toMoneyString(convertedCost);
      invoice.reconciledAt = now;
      await this.invoices.save(invoice);
      totalInvoiced = round2(totalInvoiced + invoiced);
    }

    // The period close is run-wide: it also surfaces cost with nobody billed
    // against it (new hires before their first invoice, unassigned employees).
    const payrollCost =
      snapshot.convertedEmployerCost === null ? null : Number(snapshot.convertedEmployerCost);
    const variance = payrollCost === null ? null : round2(totalInvoiced - payrollCost);
    const existingClose = await this.periodCloses.findOne({
      where: {
        serviceYear: summary.periodYear,
        serviceMonth: summary.periodMonth,
      } as FindOptionsWhere<BillingPeriodClose>,
    });
    const close =
      existingClose ??
      this.periodCloses.create({
        serviceYear: summary.periodYear,
        serviceMonth: summary.periodMonth,
      });
    close.payrollRunId = summary.runId;
    close.payDate = summary.payDate;
    close.currency = snapshot.billingCurrency;
    close.invoiceCount = invoicesForMonth.length;
    close.invoicedAmount = toMoneyString(totalInvoiced);
    close.payrollCostAmount = payrollCost === null ? null : toMoneyString(payrollCost);
    close.varianceAmount = variance === null ? null : toMoneyString(variance);
    close.status =
      payrollCost === null
        ? 'no_cost_data'
        : withinTolerance(totalInvoiced, payrollCost)
          ? 'balanced'
          : 'variance';
    await this.periodCloses.save(close);
  }

  private async removePeriodClose(serviceYear: number, serviceMonth: number): Promise<void> {
    const close = await this.periodCloses.findOne({
      where: { serviceYear, serviceMonth } as FindOptionsWhere<BillingPeriodClose>,
    });
    if (close) {
      await this.dataSource.transaction((manager) => manager.remove(close));
    }
  }

  // The reconciliation board: every month with salary/catch-up lines, what was
  // invoiced for it, and (once the month's run finalizes) the frozen payroll
  // cost. Rows follow line month labels, so catch-up billing still lands on the
  // month it belongs to.
  async listReconciliation(): Promise<ReconciliationPeriod[]> {
    const invoices = await this.invoices.find({
      where: { type: 'services', status: Not('voided') } as FindOptionsWhere<Invoice>,
    });
    if (invoices.length === 0) {
      return [];
    }
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const lines = await this.lines.find({
      where: {
        invoiceId: In(invoices.map((invoice) => invoice.id)),
        kind: In(['salary', 'catchup'] as InvoiceLineKind[]),
      } as FindOptionsWhere<InvoiceLine>,
    });
    const closes = await this.periodCloses.find();
    const closeByPeriod = new Map(
      closes.map((close) => [`${close.serviceYear}-${close.serviceMonth}`, close]),
    );

    type PeriodBucket = {
      serviceYear: number;
      serviceMonth: number;
      invoicedAmount: number;
      amountsByInvoice: Map<string, number>;
    };
    const byPeriod = new Map<string, PeriodBucket>();
    for (const line of lines) {
      if (!line.monthLabel) {
        continue;
      }
      const parsed = parseMonthLabel(line.monthLabel);
      if (!parsed) {
        continue;
      }
      const key = `${parsed.year}-${parsed.month}`;
      const bucket =
        byPeriod.get(key) ??
        {
          serviceYear: parsed.year,
          serviceMonth: parsed.month,
          invoicedAmount: 0,
          amountsByInvoice: new Map<string, number>(),
        };
      bucket.invoicedAmount = round2(bucket.invoicedAmount + Number(line.total));
      bucket.amountsByInvoice.set(
        line.invoiceId,
        round2((bucket.amountsByInvoice.get(line.invoiceId) ?? 0) + Number(line.total)),
      );
      byPeriod.set(key, bucket);
    }

    const periods: ReconciliationPeriod[] = [];
    for (const [key, bucket] of byPeriod) {
      const close = closeByPeriod.get(key);
      periods.push({
        serviceYear: bucket.serviceYear,
        serviceMonth: bucket.serviceMonth,
        status: close?.status ?? 'open',
        currency: close?.currency ?? invoices[0].currency,
        invoiceCount: bucket.amountsByInvoice.size,
        invoicedAmount: bucket.invoicedAmount,
        payrollCostAmount:
          close?.payrollCostAmount === null || close?.payrollCostAmount === undefined
            ? null
            : Number(close.payrollCostAmount),
        varianceAmount:
          close?.varianceAmount === null || close?.varianceAmount === undefined
            ? null
            : Number(close.varianceAmount),
        payrollRunId: close?.payrollRunId ?? null,
        payDate: close?.payDate ?? null,
        invoices: [...bucket.amountsByInvoice].flatMap(([invoiceId, amount]) => {
          const invoice = invoiceById.get(invoiceId);
          return invoice ? [{ invoice, invoicedAmount: amount }] : [];
        }),
      });
    }
    periods.sort(
      (a, b) => b.serviceYear * 12 + b.serviceMonth - (a.serviceYear * 12 + a.serviceMonth),
    );
    return periods;
  }

  /**
   * The auto-drafter behind the `payroll.finalized` consumer. For each billing
   * group it produces at most one Services draft per service month containing:
   *   · catch-up salary lines for past months never invoiced (pro-rated by
   *     working days actually worked),
   *   · the service-month salary line (full rate unless hired inside it),
   *   · one PEPM management fee per billed person.
   * Advance billing: on/after the anchor day the document covers the following
   * month; before it, the run's own month. Re-running for an already-covered
   * period is a no-op (uniqueness by group + type + service month).
   */
  async draftInvoicesFromRun(runId: string): Promise<Invoice[]> {
    const summary: RunBillingSummary = await this.payrollRuns.getFinalizedRunSummary(toId(runId));
    const config = await this.getConfig();
    const snapshot = await this.recordCostSnapshot(summary, config);

    // The run's own pay date decides the service month (advance billing: cut
    // on/after the anchor day covers the following month). Anchoring to the run
    // — not the wall clock — keeps replays and backfills deterministic.
    const anchorOfRunMonth = `${summary.periodYear}-${pad2(summary.periodMonth)}-${pad2(config.anchorDay)}`;
    const advance = compareIsoDate(summary.payDate, anchorOfRunMonth) >= 0;
    const service = advance
      ? addMonths(summary.periodYear, summary.periodMonth, 1)
      : { year: summary.periodYear, month: summary.periodMonth };
    const windowBase = addMonths(service.year, service.month, -1);
    const window = anchoredWindow(windowBase.year, windowBase.month, config.anchorDay);

    const groups = await this.listGroups();
    const allMembers = await this.members.find();
    if (groups.length === 0 || allMembers.length === 0) {
      await this.reconcileServiceMonth(summary, snapshot);
      return [];
    }

    const created: Invoice[] = [];
    // Months already billed are tracked globally across the whole draft call, so
    // an employee whose membership moved between groups mid-stream is billed for
    // any given month exactly once (and never double-fee'd).
    const covered = await this.loadCoveredMonths(allMembers.map((member) => member.employeeId));
    const feesBilled = new Set<string>();
    for (const group of groups) {
      const memberships = allMembers.filter((member) => member.groupId === group.id);
      if (memberships.length === 0) {
        continue;
      }

      const pending: PendingLine[] = [];

      for (const membership of memberships) {
        const employee = await this.employeeDirectory.getById(membership.employeeId);
        if (!employee) {
          continue;
        }
        const rate = Number(membership.monthlyRate);
        const personName = `${employee.firstName} ${employee.lastName}`;
        // Effective covered span for THIS membership: no earlier than the later
        // of hire date and the membership start, no later than the earlier of
        // the membership end and the employee's termination date.
        const effectiveStart =
          compareIsoDate(membership.validFrom, employee.hireDate) > 0
            ? membership.validFrom
            : employee.hireDate;
        let effectiveEnd: IsoDate | null = membership.validTo
          ? addIsoDays(membership.validTo, -1)
          : null;
        if (
          employee.terminationDate &&
          (!effectiveEnd || compareIsoDate(employee.terminationDate, effectiveEnd) < 0)
        ) {
          effectiveEnd = employee.terminationDate;
        }

        let billedAny = false;
        let cursor = {
          year: Number(effectiveStart.slice(0, 4)),
          month: Number(effectiveStart.slice(5, 7)),
        };
        while (
          cursor.year < service.year ||
          (cursor.year === service.year && cursor.month <= service.month)
        ) {
          const label = formatMonthLabel(cursor.year, cursor.month);
          const key = `${membership.employeeId}:${label}`;
          const isServiceMonth =
            cursor.year === service.year && cursor.month === service.month;
          const amount = proratedAmount(
            rate,
            effectiveStart,
            cursor.year,
            cursor.month,
            effectiveEnd,
          );
          if (amount > 0 && !covered.has(key)) {
            pending.push({
              kind: isServiceMonth ? 'salary' : 'catchup',
              employeeId: membership.employeeId,
              employeeName: personName,
              monthLabel: label,
              description: isServiceMonth ? 'Salary' : 'Salary (catch-up)',
              unitPrice: amount,
            });
            covered.add(key);
            billedAny = true;
          }
          cursor = addMonths(cursor.year, cursor.month, 1);
        }

        // One PEPM fee, billed by whichever group's membership actually covers
        // the person during the service month.
        const coversServiceMonth =
          prorationShare(effectiveStart, service.year, service.month, effectiveEnd) > 0;
        if (billedAny && coversServiceMonth && !feesBilled.has(membership.employeeId)) {
          feesBilled.add(membership.employeeId);
          pending.push({
            kind: 'fee',
            employeeId: membership.employeeId,
            employeeName: personName,
            monthLabel: null,
            description: 'Management Fees',
            unitPrice: Number(config.feeAmount),
          });
        }
      }

      if (pending.length === 0) {
        continue;
      }

      const duplicate = await this.invoices.findOne({
        where: {
          groupId: group.id,
          type: 'services',
          status: Not('voided'),
          serviceYear: service.year,
          serviceMonth: service.month,
        } as FindOptionsWhere<Invoice>,
      });
      if (duplicate) {
        continue;
      }

      const subTotal = round2(pending.reduce((sum, line) => sum + line.unitPrice, 0));
      const invoice = await this.persistDraftInvoice(
        toId<BillingGroupId>(group.id),
        'services',
        service,
        window,
        config,
        subTotal,
        summary.runId,
        pending,
      );
      created.push(invoice);
    }
    await this.reconcileServiceMonth(summary, snapshot);
    return created;
  }

  // Finance opens a manual pass-through document per group and month.
  async openDraftExpensesInvoice(
    groupId: BillingGroupId,
    serviceYear: number,
    serviceMonth: number,
  ): Promise<Invoice> {
    const group = await this.groups.findById(groupId);
    if (!group) {
      throw new NotFoundError('Billing group not found', { id: groupId });
    }
    if (serviceMonth < 1 || serviceMonth > 12) {
      throw new ValidationFailedError('serviceMonth must be between 1 and 12');
    }
    const duplicate = await this.invoices.findOne({
      where: {
        groupId,
        type: 'expenses',
        status: Not('voided'),
        serviceYear,
        serviceMonth,
      } as FindOptionsWhere<Invoice>,
    });
    if (duplicate) {
      throw new ConflictError('An expenses invoice already exists for this group and month');
    }
    const config = await this.getConfig();
    const prior = addMonths(serviceYear, serviceMonth, -1);
    const window = anchoredWindow(prior.year, prior.month, config.anchorDay);
    return this.invoices.save(
      this.invoices.create({
        groupId,
        type: 'expenses',
        status: 'draft',
        serviceYear,
        serviceMonth,
        periodStart: window.start,
        periodEndExclusive: window.endExclusive,
        currency: config.feeCurrency,
        receiverName: config.receiverName,
        receiverAddress: config.receiverAddress,
        receiverEmail: config.receiverEmail,
        receiverPhone: config.receiverPhone,
        receiverZipCode: config.receiverZipCode,
        receiverCity: config.receiverCity,
        receiverCountry: config.receiverCountry,
      }),
    );
  }

  // Published pass-through for approved employee expense claims: find or open
  // the employee's group's expenses draft for the month and append the claim's
  // lines. `sourceLabel` (the claim number) is embedded in each line so a
  // retried call skips lines it already added.
  async addExpenseClaimLines(input: {
    readonly employeeId: EmployeeId;
    readonly serviceYear: number;
    readonly serviceMonth: number;
    readonly sourceLabel: string;
    readonly lines: readonly { readonly description: string; readonly amount: number }[];
  }): Promise<{ invoice: Invoice; addedLines: number }> {
    const membership = await this.members.findOne({
      where: { employeeId: input.employeeId, validTo: IsNull() } as FindOptionsWhere<BillingGroupMember>,
      order: { validFrom: 'DESC' },
    });
    if (!membership) {
      throw new ValidationFailedError(
        'Employee has no billing membership to pass expenses through',
        { employeeId: input.employeeId },
      );
    }
    const group = await this.groups.findById(membership.groupId);
    if (!group) {
      throw new NotFoundError('Billing group not found', { id: membership.groupId });
    }
    const config = await this.getConfig();
    // One expenses document per group and month (the unique index just ignores
    // voided rows). An issued or paid one means the month is closed to new
    // pass-through lines — surface that instead of letting the insert hit the
    // unique index.
    let invoice = await this.invoices.findOne({
      where: {
        groupId: membership.groupId,
        type: 'expenses',
        status: Not('voided'),
        serviceYear: input.serviceYear,
        serviceMonth: input.serviceMonth,
      } as FindOptionsWhere<Invoice>,
    });
    if (invoice && invoice.status !== 'draft') {
      throw new ConflictError(
        `The expenses invoice for ${input.serviceYear}-${String(input.serviceMonth).padStart(2, '0')} is already ${invoice.status}`,
        { invoiceId: invoice.id, status: invoice.status },
      );
    }
    if (!invoice) {
      const prior = addMonths(input.serviceYear, input.serviceMonth, -1);
      const window = anchoredWindow(prior.year, prior.month, config.anchorDay);
      invoice = await this.invoices.save(
        this.invoices.create({
          groupId: membership.groupId,
          type: 'expenses',
          status: 'draft',
          serviceYear: input.serviceYear,
          serviceMonth: input.serviceMonth,
          periodStart: window.start,
          periodEndExclusive: window.endExclusive,
          currency: config.feeCurrency,
          receiverName: config.receiverName,
          receiverAddress: config.receiverAddress,
          receiverEmail: config.receiverEmail,
          receiverPhone: config.receiverPhone,
          receiverZipCode: config.receiverZipCode,
          receiverCity: config.receiverCity,
          receiverCountry: config.receiverCountry,
        }),
      );
    }
    const marker = `[${input.sourceLabel}]`;
    const existingLines = await this.lines.find({
      where: { invoiceId: invoice.id } as FindOptionsWhere<InvoiceLine>,
    });
    const existingMarkers = new Set(
      existingLines
        .map((line) => /\[([A-Z0-9-]+)\]$/.exec(line.description)?.[1] ?? null)
        .filter((value): value is string => value !== null),
    );
    if (existingMarkers.has(input.sourceLabel)) {
      return { invoice, addedLines: 0 };
    }
    const employee = await this.employeeDirectory.getById(input.employeeId);
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : null;
    let sortOrder = existingLines.length;
    for (const line of input.lines) {
      await this.lines.save(
        this.lines.create({
          invoiceId: invoice.id,
          kind: 'expense',
          employeeId: input.employeeId,
          employeeName,
          monthLabel: null,
          description: `${line.description.slice(0, 180)} ${marker}`,
          quantity: '1',
          unitPrice: toMoneyString(line.amount),
          total: toMoneyString(line.amount),
          sortOrder,
        }),
      );
      sortOrder += 1;
    }
    await this.recomputeTotals(toId<InvoiceId>(invoice.id));
    const refreshed = await this.invoices.findById(invoice.id);
    return { invoice: refreshed ?? invoice, addedLines: input.lines.length };
  }

  async addDraftLine(invoiceId: InvoiceId, input: AddInvoiceLineData): Promise<InvoiceLine> {
    await this.getDraft(invoiceId);
    if (input.quantity != null && input.quantity <= 0) {
      throw new ValidationFailedError('quantity must be greater than zero');
    }
    if (input.unitPrice < 0) {
      throw new ValidationFailedError('unitPrice must be zero or greater');
    }
    const kind = input.kind ?? 'expense';
    const employeeId = input.employeeId ?? null;
    if (kind !== 'expense' && !employeeId) {
      throw new ValidationFailedError(`employeeId is required for ${kind} lines`);
    }
    let employeeName: string | null = null;
    if (employeeId) {
      const employee = await this.employeeDirectory.getById(employeeId);
      if (!employee) {
        throw new NotFoundError('Employee not found', { id: employeeId });
      }
      employeeName = `${employee.firstName} ${employee.lastName}`;
    }
    const count = await this.lines.count({
      where: { invoiceId } as FindOptionsWhere<InvoiceLine>,
    });
    const quantity = input.quantity ?? 1;
    const total = round2(quantity * input.unitPrice);
    const line = await this.lines.save(
      this.lines.create({
        invoiceId,
        kind,
        employeeId,
        employeeName,
        monthLabel: input.monthLabel ?? null,
        description: (input.description?.trim() || 'Expense').slice(0, 200),
        quantity: toMoneyString(quantity),
        unitPrice: toMoneyString(input.unitPrice),
        total: toMoneyString(total),
        sortOrder: count,
      }),
    );
    await this.recomputeTotals(invoiceId);
    return line;
  }

  async updateDraftLine(input: UpdateInvoiceLineData): Promise<InvoiceLine> {
    return this.dataSource.transaction(async (manager) => {
      const line = await this.findLine(manager, input.lineId);
      const invoice = await this.findInvoice(manager, line.invoiceId);
      assertEditable(invoice.status);
      if (input.quantity != null && input.quantity <= 0) {
        throw new ValidationFailedError('quantity must be greater than zero');
      }
      if (input.unitPrice != null && input.unitPrice < 0) {
        throw new ValidationFailedError('unitPrice must be zero or greater');
      }
      if (input.description != null && input.description.trim().length > 0) {
        line.description = input.description.trim().slice(0, 200);
      }
      const quantity = input.quantity ?? Number(line.quantity);
      const unitPrice = input.unitPrice ?? Number(line.unitPrice);
      line.quantity = toMoneyString(quantity);
      line.unitPrice = toMoneyString(unitPrice);
      line.total = toMoneyString(round2(quantity * unitPrice));
      const saved = await manager.save(line);
      await recomputeTotalsWithin(manager, invoice.id);
      return saved;
    });
  }

  async removeDraftLine(lineId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const line = await this.findLine(manager, lineId);
      const invoice = await this.findInvoice(manager, line.invoiceId);
      assertEditable(invoice.status);
      await manager.remove(line);
      await recomputeTotalsWithin(manager, invoice.id);
    });
  }

  // The point of no return: assign the human number ({prefix}{sequence}),
  // freeze dates and the document snapshot, announce transactionally.
  async issueInvoice(invoiceId: InvoiceId): Promise<Invoice> {
    const result = await this.issueWithNumberRetry(invoiceId);

    await this.audit.record({
      action: 'issue',
      resourceType: 'invoice',
      resourceId: result.id,
      after: { number: result.number, totalAmount: Number(result.totalAmount) },
    });
    return result;
  }

  // Numbering is count-based, so two concurrent issues can pick the same
  // sequence. The unique index on (organizationId, number) turns the loser's
  // insert into a 23505 which we retry — by then the winner's row is visible
  // to the recount.
  private async issueWithNumberRetry(invoiceId: InvoiceId): Promise<Invoice> {
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.dataSource.transaction(async (manager) => {
          const invoice = await this.findInvoice(manager, invoiceId);
          if (invoice.status !== 'draft') {
            throw new ConflictError(`Invoice is already ${invoice.status}`);
          }
          const lineCount = await manager.count(InvoiceLine, {
            where: { invoiceId } as FindOptionsWhere<InvoiceLine>,
          });
          if (lineCount === 0) {
            throw new ValidationFailedError('Cannot issue an invoice with no lines');
          }
          const group = await manager.findOne(BillingGroup, {
            where: { id: invoice.groupId } as FindOptionsWhere<BillingGroup>,
          });
          if (!group) {
            throw new NotFoundError('Billing group not found', { id: invoice.groupId });
          }
          const prefix = invoice.type === 'services' ? group.servicesPrefix : group.expensesPrefix;
          // Only issued/paid documents consume a number — drafts must not burn
          // sequence positions for documents that may never ship.
          const sequence = await manager.count(Invoice, {
            where: {
              organizationId: invoice.organizationId,
              groupId: invoice.groupId,
              type: invoice.type,
              status: In(['issued', 'paid']),
            } as unknown as FindOptionsWhere<Invoice>,
          });
          const config = await manager.findOne(ClientBillingConfig, {
            where: {
              organizationId: invoice.organizationId,
            } as FindOptionsWhere<ClientBillingConfig>,
          });

          const issueDate = this.nowProvider().toISOString().slice(0, 10);
          invoice.number = `${prefix}${pad4(sequence + 1)}`;
          invoice.issueDate = issueDate;
          invoice.dueDate = addIsoDays(issueDate, config?.paymentTermsNetDays ?? 7);
          invoice.issuedSnapshot = {
            logoDataUrl: config?.invoiceLogoDataUrl ?? null,
            signatureDataUrl: config?.signatureDataUrl ?? null,
            senderName: config?.senderName ?? null,
            senderAddress: config?.senderAddress ?? null,
            senderZipCode: config?.senderZipCode ?? null,
            senderCity: config?.senderCity ?? null,
            senderCountry: config?.senderCountry ?? null,
            senderEmail: config?.senderEmail ?? null,
            senderPhone: config?.senderPhone ?? null,
            bankName: config?.bankName ?? null,
            bankAccountName: config?.bankAccountName ?? null,
            bankAccountNumber: config?.bankAccountNumber ?? null,
            bankSwift: config?.bankSwift ?? null,
            paymentTermsNetDays: config?.paymentTermsNetDays ?? 7,
            capturedAt: new Date().toISOString(),
          };
          invoice.status = 'issued';
          const saved = await manager.save(invoice);

          await this.publisher.publishWithin(manager, {
            name: 'invoice.issued',
            payload: {
              invoiceId: toId<InvoiceId>(saved.id),
              invoiceNumber: saved.number ?? '',
              billingGroupId: toId<BillingGroupId>(saved.groupId),
              invoiceType: saved.type,
              currency: saved.currency,
              totalAmount: Number(saved.totalAmount),
              issueDate: saved.issueDate ?? issueDate,
              dueDate: saved.dueDate ?? issueDate,
            },
          });
          return saved;
        });
      } catch (cause) {
        if (attempt >= maxAttempts || !isUniqueViolation(cause)) {
          throw cause;
        }
      }
    }
  }

  async markInvoicePaid(input: MarkInvoicePaidData): Promise<Invoice> {
    const invoice = await this.invoices.findById(input.invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found', { id: input.invoiceId });
    }
    if (invoice.status !== 'issued') {
      throw new ConflictError(`Only issued invoices can be marked paid (status: ${invoice.status})`);
    }
    invoice.status = 'paid';
    // The settlement date can lag the moment finance records it (checks clear
    // days later); default to today when not given.
    invoice.paidAt = input.settlementDate
      ? new Date(`${input.settlementDate}T00:00:00.000Z`)
      : new Date();
    invoice.paymentReference = input.paymentReference ?? null;
    const saved = await this.invoices.save(invoice);
    await this.audit.record({
      action: 'markPaid',
      resourceType: 'invoice',
      resourceId: saved.id,
      after: { number: saved.number, reference: saved.paymentReference },
    });
    return saved;
  }

  // A draft that will never ship is voided instead of deleted: the period is
  // released for re-drafting (the unique index ignores voided rows) while the
  // audit trail keeps the abandoned document.
  async voidInvoice(invoiceId: InvoiceId): Promise<Invoice> {
    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found', { id: invoiceId });
    }
    if (invoice.status !== 'draft') {
      throw new ConflictError(`Only drafts can be voided (status: ${invoice.status})`);
    }
    invoice.status = 'voided';
    const saved = await this.invoices.save(invoice);
    // A close row may have been computed including this invoice; refresh it so
    // the stored variance stops reflecting a document that no longer exists.
    const close = await this.periodCloses.findOne({
      where: {
        serviceYear: saved.serviceYear,
        serviceMonth: saved.serviceMonth,
      } as FindOptionsWhere<BillingPeriodClose>,
    });
    if (close) {
      const summary = await this.payrollRuns.getFinalizedRunSummary(
        toId<PayrollRunId>(close.payrollRunId),
      );
      const snapshot = await this.recordCostSnapshot(summary, await this.getConfig());
      await this.reconcileServiceMonth(summary, snapshot);
    }
    await this.audit.record({
      action: 'void',
      resourceType: 'invoice',
      resourceId: saved.id,
      after: { serviceYear: saved.serviceYear, serviceMonth: saved.serviceMonth },
    });
    return saved;
  }

  // --- internals ---

  // Rate/membership edits invalidate drafts that reference the employee: the
  // draft still holds the old amount. Flagging (not rewriting) keeps finance in
  // control — they void the draft and let the next run redraft it.
  private async markDraftsStaleForEmployee(
    employeeId: EmployeeId,
    reason: string,
  ): Promise<void> {
    const employeeLines = await this.lines.find({
      where: { employeeId } as FindOptionsWhere<InvoiceLine>,
    });
    const invoiceIds = [...new Set(employeeLines.map((line) => line.invoiceId))];
    if (invoiceIds.length === 0) {
      return;
    }
    const drafts = await this.invoices.find({
      where: { id: In(invoiceIds), status: 'draft' } as FindOptionsWhere<Invoice>,
    });
    for (const draft of drafts) {
      draft.isStale = true;
      draft.staleReason = reason;
      await this.invoices.save(draft);
    }
  }

  // Month labels already billed per employee across ALL invoices — drafts count,
  // so a manual draft covering September suppresses the next auto-draft's
  // September line instead of double-billing.
  private async loadCoveredMonths(employeeIds: readonly EmployeeId[]): Promise<Set<string>> {
    const covered = new Set<string>();
    if (employeeIds.length === 0) {
      return covered;
    }
    const rows = await this.lines.find({
      where: {
        employeeId: In(employeeIds as unknown as string[]),
        kind: In(['salary', 'catchup'] as InvoiceLineKind[]),
      } as unknown as FindOptionsWhere<InvoiceLine>,
    });
    const invoiceIds = [...new Set(rows.map((row) => row.invoiceId))];
    const voidedInvoiceIds = new Set<string>();
    if (invoiceIds.length > 0) {
      const owners = await this.invoices.find({
        where: { id: In(invoiceIds) } as FindOptionsWhere<Invoice>,
      });
      for (const owner of owners) {
        if (owner.status === 'voided') {
          voidedInvoiceIds.add(owner.id);
        }
      }
    }
    for (const row of rows) {
      if (row.monthLabel && row.employeeId && !voidedInvoiceIds.has(row.invoiceId)) {
        covered.add(`${row.employeeId}:${row.monthLabel}`);
      }
    }
    return covered;
  }

  private async persistDraftInvoice(
    groupId: BillingGroupId,
    type: 'services' | 'expenses',
    service: { year: number; month: number },
    window: { start: IsoDate; endExclusive: IsoDate },
    config: ClientBillingConfig,
    subTotal: number,
    sourcePayrollRunId: string | null,
    pending: readonly PendingLine[],
  ): Promise<Invoice> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.dataSource.transaction(async (manager) => {
      const invoice = manager.create(Invoice, {
        organizationId,
        groupId,
        type,
        status: 'draft',
        serviceYear: service.year,
        serviceMonth: service.month,
        periodStart: window.start,
        periodEndExclusive: window.endExclusive,
        currency: config.feeCurrency,
        receiverName: config.receiverName,
        receiverAddress: config.receiverAddress,
        receiverEmail: config.receiverEmail,
        receiverPhone: config.receiverPhone,
        receiverZipCode: config.receiverZipCode,
        receiverCity: config.receiverCity,
        receiverCountry: config.receiverCountry,
        subTotal: toMoneyString(subTotal),
        totalAmount: toMoneyString(subTotal),
        sourcePayrollRunId,
      });
      const saved = await manager.save(invoice);
      let sortOrder = 0;
      for (const line of pending) {
        await manager.save(
          manager.create(InvoiceLine, {
            organizationId,
            invoiceId: saved.id,
            kind: line.kind,
            employeeId: line.employeeId,
            employeeName: line.employeeName,
            monthLabel: line.monthLabel,
            description: line.description,
            quantity: toMoneyString(1),
            unitPrice: toMoneyString(line.unitPrice),
            total: toMoneyString(line.unitPrice),
            sortOrder: sortOrder++,
          }),
        );
      }
      return saved;
    });
  }

  private async getDraft(invoiceId: InvoiceId): Promise<Invoice> {
    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found', { id: invoiceId });
    }
    assertEditable(invoice.status);
    return invoice;
  }

  private async findInvoice(manager: EntityManager, invoiceId: string): Promise<Invoice> {
    const invoice = await manager.findOne(Invoice, {
      where: { id: invoiceId, organizationId: this.tenantContext.getOrganizationId() },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice not found', { id: invoiceId });
    }
    return invoice;
  }

  private async findLine(manager: EntityManager, lineId: string): Promise<InvoiceLine> {
    const line = await manager.findOne(InvoiceLine, {
      where: { id: lineId, organizationId: this.tenantContext.getOrganizationId() },
    });
    if (!line) {
      throw new NotFoundError('Invoice line not found', { id: lineId });
    }
    return line;
  }

  private async recomputeTotals(invoiceId: InvoiceId): Promise<void> {
    await this.dataSource.transaction((manager) => recomputeTotalsWithin(manager, invoiceId));
  }
}

const assertEditable = (status: Invoice['status']): void => {
  if (status !== 'draft') {
    throw new ConflictError(`Only draft invoices can be edited (status: ${status})`);
  }
};

const recomputeTotalsWithin = async (
  manager: EntityManager,
  invoiceId: string,
): Promise<void> => {
  const rows = await manager.find(InvoiceLine, {
    where: { invoiceId } as FindOptionsWhere<InvoiceLine>,
  });
  const subTotal =
    Math.round(rows.reduce((sum, line) => sum + Number(line.total), 0) * 100) / 100;
  const invoice = await manager.findOne(Invoice, { where: { id: invoiceId } });
  if (invoice) {
    invoice.subTotal = toMoneyString(subTotal);
    invoice.totalAmount = toMoneyString(subTotal);
    await manager.save(invoice);
  }
};





