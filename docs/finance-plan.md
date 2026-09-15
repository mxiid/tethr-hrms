# Finance Module — Build Plan

> Scope agreed 2026-08-24 on branch `finance`. Replaces the generic "Payroll" row of [plan.md §8](../plan.md) Phase 3 with a concrete design grounded in how Tethr actually bills today (Invoify JSON exports, see §9).

## 1. What we're building

Two modules that together form the finance phase:

- **`modules/payroll`** — internal payroll: monthly runs, pro-rata & LOP-aware calculation, immutable payslip snapshots, bank advice file, PK income-tax engine with override.
- **`modules/billing`** — client invoicing: billing groups, auto-drafted invoices from finalized runs, PEPM management fees, expense pass-throughs, approval, delivery, mark-paid tracking.

Wired together by domain events (`payroll.finalized` triggers invoice drafting). No shared tables, no cross-module FKs — both reference employees by ID and resolve names/facts through published interfaces only.

## 2. Locked decisions

| Decision | Outcome |
|---|---|
| Pricing basis | Fixed USD rate agreed per employee; pro-rata by working days when joining mid-month |
| Currency | Internal payroll always **PKR**; USD exists only on client invoices |
| Billing cadence | Invoice generated on the **20th covering the following month**, due **Net 7** (20th → 27th); billing period 20th→19th |
| Management fee | Flat per-employee-per-month (**PEPM**), configurable per client |
| Billing groups | Employees belong to a billing group (e.g., PowerTech, SynAck). Each group produces its own Services + Expenses invoice pair with its own prefixes (`SP`/`EP`, `SS`/`ES`). All invoices go to the single payer company (the client tenant itself) |
| Tenancy | Runs/invoices/payslips live inside the client workspace like all HR data. Only the new **finance role** creates/approves. Clients see issued invoices read-only on their portal. Employees see only their own payslips |
| Approval | Single-step approval by the finance role; Tethr Admin keeps visibility. No workflow chain for now |
| Adjustments | Free edits while a run/invoice is **draft**. Issued invoices are immutable. Post-disbursement corrections surface as catch-up lines on the next run (mirrors today's "Aug catch-up" rows) |
| Income tax | Config-driven Pakistan progressive slab engine + manual override per payslip line |
| Component breakdown | Structure-driven: salary structure defines the component split (basic %, allowances); revision sets the amount; payroll derives the breakdown |
| Expenses invoice | Manual pass-through lines added by finance while drafting (until a future expense-claims module automates them) |
| Delivery | PDF generated in HRMS, downloadable + displayed in-app. Emailing behind `NotificationService`, activated once SMTP/provider credentials exist (deferred) |
| Payments | Simple mark-paid per invoice + outstanding list |

## 3. Domain model

### `modules/payroll`
| Entity | Notes |
|---|---|
| `payroll_runs` | Tenant-scoped. Period (year, month), status `draft → finalized`, working-day basis facts, totals. One open run per period |
| `payroll_run_lines` | Per employee per run: computed amounts + finance overrides (kept separately so computed-vs-entered stays auditable). Editable only while draft |
| `payslips` | **Immutable snapshot** created at finalization: employee identity snapshot (name, designation, DOJ), period, pay date, paidDays, lopDays, PKR amounts (gross, basicPay, medicalAllowance, fuelReimbursement, taxableSalary, incomeTax, netPay), notes. Never re-reads live data |

### `modules/billing`
| Entity | Notes |
|---|---|
| `billing_groups` | Tenant-scoped: name, `servicesPrefix`, `expensesPrefix` (SP/EP, SS/ES…) |
| `billing_group_memberships` | Effective-dated `employeeId ↔ groupId`. Owned by billing — zero changes to the employee module |
| `client_billing_config` | Per tenant: fee amount (PEPM USD), paymentTerms (Net 7), anchor day (20th), receiver/bank/sender profile facts used on invoice PDFs |
| `invoices` | Tenant-scoped: group, type `services \| expenses`, human number `{prefix}{sequence}`, status `draft → issued → paid`, issue/due dates, billing period, currency USD, receiver snapshot, totals |
| `invoice_lines` | Kind `salary \| fee \| expense \| catchup`, optional employeeId ref, month label, description, qty, unit price, total |
| Invoice sequences | Counter per (group × type × tenant) |

### Compensation prerequisite (existing module, small extension)
Salary structures currently compose components; revisions carry one total. Extend so a revision's amount resolves to a component breakdown via its structure's component composition (percent-of-base or fixed parts) — config-as-data, consumed by payroll through the existing published compensation interface.

## 4. Inter-module contracts (sanctioned channels only)

| Direction | Channel | Purpose |
|---|---|---|
| payroll → compensation | Published interface | Current salary revision + structure breakdown as-of period |
| payroll → leave | Published interface | Approved unpaid-leave days in period; working-day/holiday calendar facts |
| payroll → employee | Published interface (`EmployeeDirectory`) | Active employees, joining dates for pro-rata |
| payroll → billing | Domain event `payroll.finalized` (+ interface fetch for line data) | Trigger invoice drafting |
| billing → employee | Published interface | Display names on lines |
| payroll / billing → notifications | Published interface | Email dispatch (dormant until creds exist) |

Every money value printed on a payslip or invoice is snapshotted at issuance; later salary changes never rewrite history.

**Published but intentionally unconsumed events** (integration seams, not dead code — kept so external systems and future phases bind without a contract change):

| Event | Published by | Why nothing consumes it yet |
|---|---|---|
| `invoice.issued` | `InvoiceService.issueInvoice` | Accounting/ERP hand-off (Phase 3 export seam) and client notifications; no in-repo consumer by design. |
| `bonus.awarded` | `CompensationService` when a bonus adjustment is recorded | Payroll reads adjustments through the compensation interface, not events; the event exists for future notifications/payroll-triggered flows. |

(`payroll.finalized` is consumed in-repo by billing drafting and cost snapshotting.)

## 5. Lifecycle

```
Finance opens monthly run (draft, per client workspace)
  → system computes per employee: payable working days (calendar − holidays − unpaid leave),
    pro-rata from joiningDate, structure-driven component split, PK slab tax (overridable)
  → finance reviews/edits draft lines
  → FINALIZE (permission-gated):
      · payslip snapshots written (immutable)
      · run locked
      · bank advice file produced
      · event payroll.finalized emitted transactionally
  → billing drafts Services invoice per billing group
      (salary lines + catch-up/arrears lines + PEPM fee lines)
  → finance may edit draft; adds manual expense lines → Expenses invoice per group
  → APPROVE & ISSUE: numbers assigned, receiver/totals snapshotted, immutable
  → visible read-only on client portal; PDF download everywhere
  → mark-paid (date + reference) when settled
```

Corrections after finalization ride the next run as catch-up lines (auto-suggested from the diff between disbursed and entitled amounts).

## 6. RBAC

New finance-facing permission set (`finance.runs.create`, `finance.runs.finalize`, `finance.invoices.*`, `finance.config.manage`) bound to a new **Finance** workspace role. Client roles gain read-only `finance.invoices.viewOwnOrg`; employees gain self-service `payslips.readOwn` derived from the authenticated user (same own-record pattern as existing ESS operations).

## 7. Web surfaces (design tokens throughout)

- **Finance workspace:** runs list/detail with editable line grid + finalize; invoices list/detail, draft editor, approve/issue, mark-paid; billing config (fee, terms, prefixes, groups + membership assignment); PDF preview/download; bank advice download.
- **Client portal:** issued invoices (read-only) with status + PDF.
- **Employee portal:** my payslips with PDF download.

## 8. PDF generation

Server-side render of an HTML template → headless browser → PDF in `@hrms/worker` (same approach proven by Invoify's pipeline). Templates styled from `@hrms/ui` tokens; one services/expenses invoice template, one payslip template. Files also retained via `core/documents` access descriptors.

## 9. Reference inputs (from today's manual flow)

Sample Invoify exports show: advance billing ~20th, Net 7 due, per-employee Salary rows + $300 fee rows, separate catch-up rows carrying their own month label, expense rows (e.g., laptop reimbursement) on the paired Expenses invoice, USD totals with amount-in-words, shared bank details + SWIFT note, signature image, logo. Payslip fields to reproduce: gross/basic/medical/fuel/taxable/incomeTax/netPay, paidDays, lopDays, PKR.

## 10. Build order

| Slice | Content |
|---|---|
| **F1 — Payroll core** | Compensation structure-breakdown extension; PK tax slab config + calculator + override; payroll runs (draft/edit/finalize), pro-rata + LOP math, payslip snapshots, bank advice CSV, finance role + permissions |
| **F2 — Billing core** | Billing groups + memberships + client billing config; `payroll.finalized` consumer drafting Services invoices; numbering; approve/issue immutability; catch-up line suggestions |
| **F3 — Delivery & payments** | PDF pipeline (worker) + downloads; expenses invoices with manual lines; mark-paid + outstanding list; client portal + employee payslip views |
| **F4 — Emails** | Wire `NotificationService` channels (payslip + invoice emails) once SMTP/provider creds exist |

## 11. Phase 2 — the employee money loop (agreed 2026-09-14)

Phase 1 made the existing flow honest (employer cost, frozen cost snapshots, reconciliation, disbursement state). Phase 2 builds the three operational features the flow audit confirmed absent — with the ledger still intentionally deferred to a Phase 3 export seam.

**M1 — Expense claims & reimbursements.** A new `modules/expenses` owns `ExpenseCategory` (receipts required, client-billable), `ExpenseClaim` (draft → submitted → approved/rejected → paid, per-org `EXP-` number, totals snapshotted server-side) and `ExpenseClaimLine` (category, date, amount, receipt). Approval rides the existing `WorkflowService` (`subjectType 'expenseClaim'`), so there is no second approval mechanism. Reimbursement is explicit: finance marks a claim paid either directly (reference) or via payroll — which creates a `PayAdjustment(kind 'reimbursement')` for a chosen period so the next run pays it with provenance back to the claim. Billable lines can be pushed to the client's draft **expenses invoice** through a new billing published method (find-or-open the month's draft, add `expense` lines), replacing today's entirely manual typing. *(Built 2026-09-14 — see STATUS.md.)*

**M2 — Per-employee tax profile & withholding election.** Effective-dated `EmployeeTaxProfile`: filer status, tax credits, additional exemptions, fixed monthly withholding, prior-employer income. Payroll resolves the profile per employee per period through the compensation published interface and `calculateMonthlyWithholding` gains the options; the payslip records which profile facts it applied. The tenant slab ladder stays the default when no profile exists. *(Built 2026-09-14 — see STATUS.md.)*

**M3 — Benefits enrollment & contributions.** `BenefitPlan` (employee and employer contribution amounts, taxable flags, effective window) and effective-dated `BenefitEnrollment`. Payroll materializes active enrollments as deduction lines plus employer-contribution lines — the latter feeding the employer-cost totals Phase 1 made first-class. Enrollment changes are effective-dated facts, never edits; each enrollment snapshots the plan's amounts so plan edits only shape future enrollments. *(Built 2026-09-14 — see STATUS.md. Phase 2 complete.)*

