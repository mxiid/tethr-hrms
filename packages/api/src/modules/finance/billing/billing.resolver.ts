import { toId, type BillingGroupId, type EmployeeId, type InvoiceId } from '@hrms/shared';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { NotFoundError } from '../../../common/errors';
import { PERMISSIONS } from '../../../core/authz/permissions';
import { PermissionsGuard } from '../../../core/authz/permissions.guard';
import { RequirePermissions } from '../../../core/authz/require-permissions.decorator';
import { EmployeeDirectoryService } from '../../employee';

import {
  BillingGroupView,
  BillingMemberView,
  ClientBillingConfigView,
} from './dto/billing-config.view';
import {
  AddInvoiceLineInput,
  CreateBillingGroupInput,
  MarkInvoicePaidArgs,
  OpenExpensesInvoiceArgs,
  SetBillingMemberInput,
  UpdateBillingConfigInput,
  UpdateInvoiceLineInput,
} from './dto/billing.inputs';
import { InvoiceView } from './dto/invoice.view';
import type { BillingGroupMember } from './entities/billing-group-member.entity';
import type { BillingGroup } from './entities/billing-group.entity';
import type { ClientBillingConfig } from './entities/client-billing-config.entity';
import type { Invoice } from './entities/invoice.entity';
import type { InvoiceDetail } from './invoice.service';
import { InvoiceService } from './invoice.service';
import { InvoicePdfService } from './pdf/invoice-pdf.service';

const toGroupView = (group: BillingGroup): BillingGroupView => ({
  id: group.id,
  name: group.name,
  servicesPrefix: group.servicesPrefix,
  expensesPrefix: group.expensesPrefix,
});

const toMemberView = (
  member: BillingGroupMember,
  displayName: string | null,
  groupName: string | null,
): BillingMemberView => ({
  id: member.id,
  employeeId: member.employeeId,
  displayName,
  groupId: member.groupId,
  groupName,
  monthlyRate: Number(member.monthlyRate),
  rateCurrency: member.rateCurrency,
});

const toConfigView = (config: ClientBillingConfig): ClientBillingConfigView => ({
  id: config.id,
  feeAmount: Number(config.feeAmount),
  feeCurrency: config.feeCurrency,
  paymentTermsNetDays: config.paymentTermsNetDays,
  anchorDay: config.anchorDay,
  receiverName: config.receiverName,
  receiverAddress: config.receiverAddress,
  receiverEmail: config.receiverEmail,
  receiverZipCode: config.receiverZipCode,
  receiverCity: config.receiverCity,
  receiverCountry: config.receiverCountry,
  senderZipCode: config.senderZipCode,
  senderCity: config.senderCity,
  senderCountry: config.senderCountry,
  invoiceLogoDataUrl: config.invoiceLogoDataUrl,
  signatureDataUrl: config.signatureDataUrl,
  senderName: config.senderName,
  senderEmail: config.senderEmail,
  bankName: config.bankName,
  bankAccountName: config.bankAccountName,
  bankAccountNumber: config.bankAccountNumber,
  bankSwift: config.bankSwift,
});

const toInvoiceView = (invoice: Invoice, groupName?: string | null): InvoiceView => ({
  id: invoice.id,
  groupId: invoice.groupId,
  groupName,
  type: invoice.type,
  status: invoice.status,
  serviceYear: invoice.serviceYear,
  serviceMonth: invoice.serviceMonth,
  periodStart: invoice.periodStart,
  periodEndExclusive: invoice.periodEndExclusive,
  number: invoice.number,
  issueDate: invoice.issueDate,
  dueDate: invoice.dueDate,
  currency: invoice.currency,
  receiverName: invoice.receiverName,
  subTotal: Number(invoice.subTotal),
  totalAmount: Number(invoice.totalAmount),
  paidAt: invoice.paidAt,
  paymentReference: invoice.paymentReference,
});

@Resolver(() => InvoiceView)
export class BillingResolver {
  constructor(
    private readonly invoicesService: InvoiceService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly employeeDirectory: EmployeeDirectoryService,
  ) {}

  // --- Configuration & groups (finance) ---

  @Query(() => ClientBillingConfigView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingRead)
  async billingConfig(): Promise<ClientBillingConfigView> {
    return toConfigView(await this.invoicesService.getConfig());
  }

  @Mutation(() => ClientBillingConfigView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async updateBillingConfig(
    @Args('input') input: UpdateBillingConfigInput,
  ): Promise<ClientBillingConfigView> {
    return toConfigView(await this.invoicesService.updateConfig(input));
  }

  @Query(() => [BillingGroupView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingRead)
  async billingGroups(): Promise<BillingGroupView[]> {
    const groups = await this.invoicesService.listGroups();
    const members = await this.invoicesService.listMembers();
    return groups.map((group) => ({
      ...toGroupView(group),
      memberCount: members.filter((member) => member.groupId === group.id).length,
    }));
  }

  @Mutation(() => BillingGroupView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async createBillingGroup(
    @Args('input') input: CreateBillingGroupInput,
  ): Promise<BillingGroupView> {
    return toGroupView(await this.invoicesService.createGroup(input));
  }

  @Query(() => [BillingMemberView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingRead)
  async billingMembers(
    @Args('groupId', { type: () => ID, nullable: true }) groupId?: string,
  ): Promise<BillingMemberView[]> {
    const members = await this.invoicesService.listMembers(
      groupId ? toId<BillingGroupId>(groupId) : undefined,
    );
    const groups = await this.invoicesService.listGroups();
    const views: BillingMemberView[] = [];
    for (const member of members) {
      const displayName = await this.employeeDirectory.getDisplayName(member.employeeId);
      views.push(
        toMemberView(member, displayName, groups.find((g) => g.id === member.groupId)?.name ?? null),
      );
    }
    return views;
  }

  @Mutation(() => BillingMemberView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async setBillingMember(@Args('input') input: SetBillingMemberInput): Promise<BillingMemberView> {
    const member = await this.invoicesService.setMember({
      employeeId: toId<EmployeeId>(input.employeeId),
      groupId: toId<BillingGroupId>(input.groupId),
      monthlyRate: input.monthlyRate,
    });
    const displayName = await this.employeeDirectory.getDisplayName(member.employeeId);
    const groups = await this.invoicesService.listGroups();
    return toMemberView(
      member,
      displayName,
      groups.find((g) => g.id === member.groupId)?.name ?? null,
    );
  }

  @Mutation(() => Boolean)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async removeBillingMember(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<boolean> {
    await this.invoicesService.removeMember(toId<EmployeeId>(employeeId));
    return true;
  }

  // --- Invoices ---

  @Query(() => [InvoiceView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingRead)
  async invoices(): Promise<InvoiceView[]> {
    const [invoices, groups] = await Promise.all([
      this.invoicesService.listInvoices(),
      this.invoicesService.listGroups(),
    ]);
    return invoices.map((invoice) =>
      toInvoiceView(invoice, groups.find((g) => g.id === invoice.groupId)?.name ?? null),
    );
  }

  // Client-portal read path: issued and paid only.
  @Query(() => [InvoiceView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingOwnRead)
  async clientInvoices(): Promise<InvoiceView[]> {
    const [invoices, groups] = await Promise.all([
      this.invoicesService.listVisibleInvoices(),
      this.invoicesService.listGroups(),
    ]);
    return invoices.map((invoice) =>
      toInvoiceView(invoice, groups.find((g) => g.id === invoice.groupId)?.name ?? null),
    );
  }

  @Query(() => InvoiceView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingRead)
  async invoice(
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<InvoiceView> {
    const detail = await this.invoicesService.getInvoiceDetail(toId<InvoiceId>(invoiceId));
    return this.toDetailView(detail);
  }

  @Query(() => InvoiceView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingOwnRead)
  async clientInvoice(
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<InvoiceView> {
    const detail = await this.invoicesService.getInvoiceDetail(toId<InvoiceId>(invoiceId));
    if (detail.invoice.status === 'draft') {
      throw new NotFoundError('Invoice not found', { id: invoiceId });
    }
    return this.toDetailView(detail);
  }

  // Manual re-trigger of the auto-drafter for a finalized run (the event
  // consumer normally does this; useful for retries and backfills).
  @Mutation(() => [InvoiceView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async draftInvoicesFromRun(
    @Args('runId', { type: () => ID }) runId: string,
  ): Promise<InvoiceView[]> {
    const created = await this.invoicesService.draftInvoicesFromRun(runId);
    const groups = await this.invoicesService.listGroups();
    return created.map((invoice) =>
      toInvoiceView(invoice, groups.find((g) => g.id === invoice.groupId)?.name ?? null),
    );
  }

  @Mutation(() => InvoiceView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async openExpensesInvoice(@Args() args: OpenExpensesInvoiceArgs): Promise<InvoiceView> {
    const invoice = await this.invoicesService.openDraftExpensesInvoice(
      toId<BillingGroupId>(args.groupId),
      args.serviceYear,
      args.serviceMonth,
    );
    const groups = await this.invoicesService.listGroups();
    return toInvoiceView(invoice, groups.find((g) => g.id === invoice.groupId)?.name ?? null);
  }

  @Mutation(() => InvoiceView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async addInvoiceLine(@Args('input') input: AddInvoiceLineInput): Promise<InvoiceView> {
    await this.invoicesService.addDraftLine(toId<InvoiceId>(input.invoiceId), {
      description: input.description,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
    });
    return this.refreshed(input.invoiceId);
  }

  @Mutation(() => InvoiceView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async updateInvoiceLine(@Args('input') input: UpdateInvoiceLineInput): Promise<InvoiceView> {
    const line = await this.invoicesService.updateDraftLine({
      lineId: input.lineId,
      description: input.description,
      quantity: input.quantity ?? undefined,
      unitPrice: input.unitPrice ?? undefined,
    });
    return this.refreshed(line.invoiceId);
  }

  @Mutation(() => InvoiceView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async removeInvoiceLine(
    @Args('lineId', { type: () => ID }) lineId: string,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<InvoiceView> {
    await this.invoicesService.removeDraftLine(lineId);
    return this.refreshed(invoiceId);
  }

  @Mutation(() => InvoiceView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async issueInvoice(
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<InvoiceView> {
    await this.invoicesService.issueInvoice(toId<InvoiceId>(invoiceId));
    return this.refreshed(invoiceId);
  }

  @Mutation(() => InvoiceView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async markInvoicePaid(@Args() args: MarkInvoicePaidArgs): Promise<InvoiceView> {
    await this.invoicesService.markInvoicePaid({
      invoiceId: toId<InvoiceId>(args.invoiceId),
      paymentReference: args.paymentReference ?? null,
    });
    return this.refreshed(args.invoiceId);
  }

  // --- PDF documents ---

  private async renderInvoicePdfBase64(
    invoiceId: string,
    kind: 'invoice' | 'addendum',
  ): Promise<string> {
    const { invoice, lines } = await this.invoicesService.getInvoiceDetail(
      toId<InvoiceId>(invoiceId),
    );
    const [config, groups] = await Promise.all([
      this.invoicesService.getConfig(),
      this.invoicesService.listGroups(),
    ]);
    const pdf =
      kind === 'addendum'
        ? await this.invoicePdfService.renderAddendumPdf(
            invoice,
            lines,
            config,
            groups.find((g) => g.id === invoice.groupId)?.name ?? '',
          )
        : await this.invoicePdfService.renderInvoicePdf(
            invoice,
            lines,
            config,
            groups.find((g) => g.id === invoice.groupId)?.name ?? '',
          );
    return pdf.toString('base64');
  }

  @Query(() => String)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingRead)
  async invoicePdf(@Args('invoiceId', { type: () => ID }) invoiceId: string): Promise<string> {
    return this.renderInvoicePdfBase64(invoiceId, 'invoice');
  }

  @Query(() => String)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingRead)
  async invoiceAddendumPdf(
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<string> {
    return this.renderInvoicePdfBase64(invoiceId, 'addendum');
  }

  // Client-portal variants: issued/paid documents only, never drafts.
  private async renderClientPdfBase64(invoiceId: string, kind: 'invoice' | 'addendum') {
    const detail = await this.invoicesService.getInvoiceDetail(toId<InvoiceId>(invoiceId));
    if (detail.invoice.status === 'draft') {
      throw new NotFoundError('Invoice not found', { id: invoiceId });
    }
    return this.renderInvoicePdfBase64(invoiceId, kind);
  }

  @Query(() => String)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingOwnRead)
  async clientInvoicePdf(@Args('invoiceId', { type: () => ID }) invoiceId: string): Promise<string> {
    return this.renderClientPdfBase64(invoiceId, 'invoice');
  }

  @Query(() => String)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingOwnRead)
  async clientInvoiceAddendumPdf(
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<string> {
    return this.renderClientPdfBase64(invoiceId, 'addendum');
  }

  private async refreshed(invoiceId: string): Promise<InvoiceView> {
    const detail = await this.invoicesService.getInvoiceDetail(toId<InvoiceId>(invoiceId));
    return this.toDetailView(detail);
  }

  private async toDetailView(detail: InvoiceDetail): Promise<InvoiceView> {
    const groups = await this.invoicesService.listGroups();
    return {
      ...toInvoiceView(detail.invoice, groups.find((g) => g.id === detail.invoice.groupId)?.name ?? null),
      lines: detail.lines.map((line) => ({
        id: line.id,
        invoiceId: line.invoiceId,
        kind: line.kind,
        employeeId: line.employeeId,
        employeeName: line.employeeName,
        monthLabel: line.monthLabel,
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        total: Number(line.total),
      })),
    };
  }
}
