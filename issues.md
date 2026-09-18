# Deferred issues

> Tickets we consciously deferred, with enough context to pick them up cold.
> Each entry records its severity and source, where the change lands, the
> preconditions, the impact, the planned fix, and the tests to add.

## ISS-001 - Hiring-request updates can commit competing transitions (no row lock)

- **Severity:** Medium (reliability) - *Inferred* by CodeRabbit's security pass on PR #3 (2026-09-15).
- **Status:** Deferred (approved to fix after the current work; judged not critical).
- **Where:** `packages/api/src/modules/recruitment/recruitment.service.ts` -
  `updateHiringRequest` to `run`'s request read (`manager.findOne(HiringRequest, ...)`, ~line 250).
  No row lock or optimistic-version check, and `BaseEntity` has no version column.
- **Preconditions:** two `updateHiringRequest` calls for the same request milliseconds apart,
  by a user holding `hiring-request:manage` (clients cannot update requests).
- **Impact:** both transitions are legal from the same prior status and both commit (last write
  wins), producing duplicate/misleading audit rows and `hiringRequest.updated` events plus a
  briefly wrong Slack notice. Position/posting state converges through the reload + convergence
  reconciliation and the durable consumer; no incorrect terminal state, no cross-tenant effect.
- **Planned fix:** add `lock: { mode: 'pessimistic_write' }` to that read, matching offer
  acceptance and final-settlement `markPaid`. Concurrent transitions then serialize and the
  state machine rejects an illegal move instead of double-committing.
- **Tests:** assert the locked read; existing state-machine and convergence specs stay green.
- **History:** deliberately scoped out in the CR1 round, where reload + convergence was chosen.

## ISS-002 - Position link/audit can commit before the position reaches its status

- **Severity:** Medium (architecture/reliability) - *Inferred* by CodeRabbit's security pass on PR #3 (2026-09-15).
- **Status:** Deferred (approved to fix after the current work; judged not critical).
- **Where:** `recruitment.service.ts` `reconcilePosition` unlinked-open branch (~lines 507-531):
  `ensureByTitle` (its own transaction) then the `linkPositionForRequest` transaction (writes
  `positionId` and the `linkPosition` audit) then `setStatus(..., 'open')` **outside** that
  transaction. Acceptance's fallback is already atomic inside the hire transaction.
- **Preconditions:** process crash or database failure in the gap between the link commit and
  the status write - no API-triggerable path.
- **Impact:** the request is linked while its position has not reached the matching status
  (e.g. linked but still `frozen`) until reconciliation. The `hiringRequest.updated` event's
  outbox consumer retries idempotently and any later update also reconciles, so it self-heals.
- **Planned fix:** run the whole unlinked-open branch in ONE `dataSource.transaction`:
  `ensureByTitle(title, manager)`, then `linkPositionForRequest(..., manager)` (skip opening the
  position when it returns `false`), then `setStatus(id, 'open', manager)`. Any failure rolls
  everything back - a newly created position included - and the consumer retries the same work.
- **Tests:** the open-branch reconciliation passes the transaction manager to all three calls;
  the `affected = 0` path still skips opening; a failure rolls back.

## ISS-003 - Posting cleanup ownership boundary (hardening, deliberately skipped)

- **Severity:** Low (architecture hardening) - code-review suggestion on PR #3 (2026-09-15).
- **Status:** Deferred by choice; the security-relevant part is already done.
- **Where:** `recruitment.service.ts` `unpublishPostingsForRequest` (used by the sync best-effort
  path and the `hiringRequest.updated` consumer).
- **Context:** the privileged mutation already carries the active operator `organizationId`
  predicate on its raw manager query, so it cannot match another workspace's posting. What
  remains is structural: the bulk unpublish lives in `RecruitmentService` rather than in
  `AtsService`, the module's posting owner.
- **Planned fix:** move `unpublishPostingsForRequest` into `AtsService` (the consumer and the
  sync wrapper call it there), keeping the conditional predicate and per-posting audits.
- **Tests:** the AtsService spec gains the bulk-unpublish cases; the consumer spec points at the
  moved method; schema and live suites unchanged.

## ISS-004 - Onboarding advances past malformed emails (native constraints not validated)

- **Severity:** Medium (validation UX) - *Major* by CodeRabbit on PR #5 (2026-09-16).
- **Status:** Deferred (logged per review triage; assessed non-critical because the API rejects the value).
- **Where:** `packages/web/src/components/onboarding/OnboardingFlow.tsx` `onFormSubmit` (~line 152) and
  `packages/web/src/modules/clients/components/WorkspaceOnboardingForm.tsx` `administratorsValid` (~line 66).
  The flow form sets `noValidate`, so the application-level `stepValid` is the only gate even though the
  admin email inputs are `type="email"` (lines 239 and 279).
- **Preconditions:** a malformed but non-empty administrator email (e.g. a missing TLD).
- **Impact:** Continue advances and the final submit sends the value; the server's `@IsEmail()` on
  `OnboardClientInput` (`onboard-client.input.ts:39,48`) rejects it with a generic validation error instead of
  an inline field error. No invalid data persists.
- **Planned fix:** in `onFormSubmit`, always collect the native-invalid controls (the invalid branch already
  computes them) and block when `!stepValid || nativeInvalid.length > 0`, focusing the first invalid control
  and exposing it with `aria-invalid` while the step error shows.
- **Tests:** browser check - a malformed email blocks Continue and focuses the email input; the existing
  exact-length currency case keeps focusing its field; the valid path still advances.

## ISS-005 - Postal-code autocomplete is not section-scoped

- **Severity:** Low (autofill accuracy) - CodeRabbit on PR #5 (2026-09-16).
- **Status:** Deferred (logged per review triage).
- **Where:** `packages/web/src/modules/self-service/pages/MyProfilePage.tsx:562` (`profile-postal`) and
  `:652` (`profile-perm-postal`) still use the bare `postal-code` token, while the adjacent address fields
  already carry `section-current` (lines 507-538) and `section-permanent` (lines 595-626).
- **Impact:** browser autofill can copy one address's postal code into the other address group.
- **Planned fix:** prefix the two tokens - `section-current postal-code` and `section-permanent postal-code`.
- **Tests:** static - extend `verify-guidelines` so address tokens in the profile must be section-scoped.

## ISS-006 - Billing group/expense validation paths lack aria-invalid/describedby

- **Severity:** Low (accessibility consistency) - CodeRabbit on PR #5 (2026-09-16).
- **Status:** Deferred (logged per review triage).
- **Where:** `packages/web/src/modules/finance/billing/pages/BillingPage.tsx` `onCreateGroup` (~lines 563-565,
  control `group-name` at 780) and the expenses-draft submit (~lines 863-866, control `expense-group` at 883).
  The rate form already sets `aria-invalid` + `aria-describedby` on its error (`7e532b3`).
- **Impact:** the alert announces, but the focused control is not exposed as invalid nor associated with the
  message.
- **Planned fix:** mirror the rate form - an invalid-fields state per form, an `id` on each alert paragraph,
  `aria-invalid`/`aria-describedby` on the two controls, cleared when the modal opens.
- **Tests:** extend `verify-a11y-sweep` (or a focused script) to submit each form empty and assert both
  attributes land on the right control.

## ISS-007 - Expenses table lost ~524px to an empty grid track (fixed)

- **Severity:** Medium (layout bug) - reported by the user on 2026-09-16 (claim text collided with the next
  column; dates wrapped and status chips stacked once the panel opened).
- **Status:** Fixed in PR B (`5117105`).
- **Where:** `packages/web/src/modules/expenses/pages/ExpensesPage.tsx` nested `<div className="page-frame">`
  (the rail grid `minmax(0, 1fr) 500px`) inside `<section className="list-with-panel">`, whose panel is a flex
  sibling - so the grid's second track was reserved but empty. `ExpensesPage` also rendered
  `<span className="employee-cell">` with no matching CSS rule, so the claim number and purpose ran together
  inline and could not truncate.
- **Fix:** the wrapper is gone (the content column is the flex child directly) and `.employee-cell` now stacks
  and truncates its two lines. Invoice detail looked identical but its rail really hosts the actions aside -
  verified and left alone.
- **Tests:** `verify-expenses-width.cjs` (table tracks the content edge closed; stays >900px open with
  single-line rows, dates, and chips).

## ISS-008 - Stateful UI is not deep-linkable (no URL state)

- **Severity:** Low-Medium (UX) - guidelines audit (2026-09-16).
- **Status:** Partially addressed. Dashboard layouts persist per user + workspace in localStorage and
  the active dashboard view rides in `?view=` (2026-09-16); the selections below still reset.
- **Where:** ~15 `useState` selections that should be query params: attendance tab and date range
  (`TimeAttendancePage`), profile tab (`EmployeeProfilePage`), every list's side-panel selection (leave,
  expenses, feedback, candidates, hiring, interviews, shortlists, compensation, employees, invoice, payroll
  run), the Shortlists posting filter, and the dashboard active view (Jotai, resets on refresh).
- **Impact:** refresh, back, and link-sharing lose context; only filters/sorts/columns are URL-synced today
  (`useListView`).
- **Planned fix:** extend the `useListView` pattern with a small `useSearchParamState` helper and migrate the
  selections; dashboard view id into the query string.
- **Tests:** browser checks - open a panel/tab, reload, assert the same state; back button returns.

## ISS-009 - Large lists render every row

- **Severity:** Low (performance) - guidelines audit (2026-09-16).
- **Status:** Deferred. Tables now use `content-visibility: auto`, but that only skips painting
  offscreen rows (they are still created) and does not touch the `.map` lists below.
- **Where:** unbounded `.map` renders: payroll run lines, org chart forest, time entries/timesheets, job-pay
  payslips, client workspace employees, workspace users, invoice lines.
- **Impact:** very long lists paint everything on first render; no virtualization anywhere.
- **Planned fix:** adopt a small virtualization approach (or `content-visibility` where semantics allow) for
  the remaining lists, starting with payroll lines and the org chart.
- **Tests:** perf spot check on a generated long list.

## ISS-010 - Full locale-helper dedupe (month arrays and compact money)

- **Severity:** Low (maintainability) - guidelines audit (2026-09-16).
- **Status:** Deferred (the shared helpers landed in PR A; the display sites migrated in PR B).
- **Where:** ~12 duplicated month-name arrays and ~11 local `formatMoney` variants that use
  `maximumFractionDigits: 0` (kept local on purpose - shared would add cents); remaining manual month labels.
- **Planned fix:** extend `@hrms/shared` with `monthLabel(date, options)` and a compact-money option, then
  migrate; delete the month arrays.
- **Tests:** shared specs for the new helpers; snapshots of the migrated screens.

## ISS-011 - Transient notices have no shared toast host

- **Severity:** Low (consistency) - guidelines audit (2026-09-16).
- **Status:** Deferred.
- **Where:** every `.form-success` / `.auth-error` notice is rendered and announced locally per screen.
- **Impact:** inconsistent placement/duration; no way to announce an action that navigates away.
- **Planned fix:** a single toast host at the root (aria-live polite) with a `useToast()` helper; migrate the
  successful mutation notices first, keeping inline errors where they belong to a field.
- **Tests:** browser check - action shows one toast, announced once, auto-dismisses.

## ISS-012 - No unsaved-changes navigation guard

- **Severity:** Low-Medium (data loss risk) - guidelines audit (2026-09-16).
- **Status:** Deferred.
- **Where:** workspace onboarding, the employee create side panel, profile edit, billing settings - closing
  or navigating away silently drops typed input.
- **Planned fix:** a router blocker (`useBlocker`) plus `beforeunload` where the form is long, with a confirm
  dialog ("Discard unsaved changes?") reusing the shared ConfirmProvider.
- **Tests:** browser check - type, navigate, cancel keeps the form; confirm leaves.

## ISS-013 - Command palette filters on every keystroke

- **Severity:** Low (performance) - guidelines audit (2026-09-16).
- **Status:** Deferred.
- **Where:** `AppShell` jump-to search scans all loaded employees, payroll runs, and invoices per keystroke
  (memoized but not deferred).
- **Planned fix:** wrap the query in `useDeferredValue` (or debounce ~120ms) and cap the scan.
- **Tests:** type a burst and assert a single render pass per frame budget.
