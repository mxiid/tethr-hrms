# Foundation Status

> As of 2026-09-04 (`feat/attendance-module-and-ux-revamp`). Phases 0–2 plus the V1 portal foundation are complete; Finance F1 (payroll core) and F2 (billing core) are built and smoke-verified — see [finance-plan.md](finance-plan.md). **Attendance is now exposed and guarded**, and the employee/onboarding surfaces have been reworked. Sections below run newest-first.

## ATS — M7–M9: shortlists, interviews, offer→hire — the agency cycle closes (2026-09-14)

**M7 — shortlists in batches.** `Shortlist` (jobPostingId, roundNumber unique per posting, `draft → presented → feedbackReceived → closed`, presentedAt/closedAt) and `ShortlistEntry` (applicationId, rank, `clientDecision: pending|interested|rejected`, clientNote, decidedAt). Tethr builds a round from a posting's applications in the order that becomes the rank, presents it (which moves those applications to the `shortlisted` stage), and closes it; a new round is just `nextRoundNumber`. The client sees only presented rounds whose posting traces back to their own organization — computed server-side by the audited platform switch with the filter taken from the caller's organization, never from anything the client sent — and records per-entry verdicts with a note; the first verdict moves the round to `feedbackReceived`. A client attempting another client's entry gets *not found* (the projection does not confirm what it hides). New permissions `shortlist:read`/`shortlist:decide` (client roles get both; Tethr roles read; decide also via tethrAdmin). UI: a Tethr `/hiring/shortlists` page (posting picker, round table with Present/Close, ranked builder panel, entry detail) and a "Candidates presented to you" section on the client `/hiring` page with Interested / Not interested buttons and optional notes. Verified 10/10 end to end (ranked draft, present→stage, client projection with ranks, verdicts + note, status roll-forward, cross-client isolation, close).

**M8 — interviews and scorecards.** `InterviewRound` templates (name, order, skills, expected rating; three defaults seeded on first use), `Interview` (application + round + scheduledAt + status/outcome), `InterviewPanelMember` (internal user id **or** external name/email — the client's staff have no HRMS login), `InterviewFeedback` (one per panellist, `withdrawnAt` for withdraw-to-refile with a partial unique index, `panelMemberId` = whose opinion, `recordedByUserId` = who typed it) and per-skill `InterviewFeedbackSkill` scores. Guards: feedback must reference a panellist on that interview, one active scorecard per panellist, and nothing may be filed before the scheduled slot — with the explicit deviation from Frappe that there is no "session user must be the interviewer" check, because Tethr records on the client's behalf. Averages are computed on read (per feedback → per interview → per skill) so they can never go stale, and withdrawn scorecards are excluded. The client gets a read-only `myInterviewOutcomes` projection (round, status, outcome — no panellists, no scorecards). UI: `/hiring/interviews` (list with scorecard progress and averages, schedule panel with application/round/time/panel, scorecard filing per panellist, withdraw, outcome) plus an interview-outcomes section on the client page. Verified 9/9 (panel scheduling, before-slot refusal, duplicate-withdraw-refile, rollup after withdrawal, client outcome read, cross-client isolation).

**M9 — offer and hire.** `Offer` hangs off the application with **typed core terms** — baseSalary, salaryCurrency, startDate, probationDays, noticePeriodDays — plus a small `extras` bag for genuine one-offs (deliberately not Frappe's unqueryable key/value `offer_term`), and `draft → sent → accepted/declined/withdrawn`. One active offer per application (not Frappe's globally-by-email duplicate check, which would block legitimate parallel agency offers). Acceptance is the hire: the service asserts platform scope, switches into the **client's workspace**, creates the employee through the existing `EmployeeService.create` (name split from the candidate's full name at hire, workEmail from the candidate, roleTitle from the posting, hireDate from the offer), and stores `hiredEmployeeId` on the offer so the hire traces to the offer → application → posting → request. It then marks the application `hired`, unpublishes the posting, fills the linked position, and fills the client's hiring request (with the internal note masked from the client). UI: offers appear on the Candidates page's application card (create with terms, Send, Record acceptance & hire, Withdraw). Verified 9/9 (typed draft, draft-not-acceptable, duplicate refused, send, acceptance → employee in the client workspace with the offer's terms, request filled, posting closed, position filled).

**The whole cycle now runs in-product:** client briefs a role → Tethr opens and publishes it → a signed public link collects anonymous applications with CVs → the candidate pool and per-application pipeline → ranked shortlist rounds with client verdicts in the portal → interviews with independent scorecards and rollups → typed offer → acceptance hires the employee into the client's workspace and closes the loop. Checkpoint totals: **198 API / 20 shared / 5 UI tests**; browser suites M4 7/7, M5 8/8, M6 10/10, cross-workspace E2E 10/10, M7 10/10, M8 9/9, M9 9/9.

**Tidy-up pass (same day, M10):** the candidate acknowledgement email is now wired — the `form.submitted` intake consumer sends an `applicationReceived` email to the candidate (Resend when configured, logger in dev), so the email channel has a production caller alongside the `hiringRequest.submitted` Slack alert. Dead paths were removed: the `send-notification` and `relay-outbox` jobs (no producer ever existed; the relay runs in-API), the notifications queue (the worker serves `hrms-default` only), `FormsService.publishForm` (no resolver), and the unused `applicationInterviews`/`applicationOffers` queries and their service methods. `declineOffer` is now reachable from the Candidates page (Record decline), closed shortlist rounds render their close date, offer acceptance retries a colliding `EMP-` number instead of failing the hire, a duplicate manual candidate maps to a friendly `ConflictError`, the email/Slack transports carry a 10s timeout (a stalled provider can no longer wedge the relay), the shortlist/candidate lists batch their CV-presence lookup instead of one query per row, uploaded document content types now prefer the browser-reported `file.type` (a `.docx` was being stored as `application/pdf`), Sentry samples 10% in production, and the `/hiring` nav item is hidden from `tethrFinance` (it holds neither `hiring-request:read` nor the ATS permissions). Verified after the pass: gates green (198 API / 20 shared / 5 UI), M6 10/10, M7 10/10, cross-workspace 10/10, M8 9/9, M9 9/9, and no test rows left in the dev database.

**Hardening pass (same day):** offer acceptance is now genuinely atomic — it runs in one transaction that first re-fetches the offer with a `FOR UPDATE` row lock and re-checks `status === 'sent'`, so two concurrent acceptances produce exactly one hire (the loser gets a conflict) and any failure mid-sequence rolls the whole thing back, leaving the offer `sent` for a retry. Threading the transaction required optional `manager` parameters on `EmployeeService.create`, `PositionService.ensureByTitle/setStatus` and `RecruitmentService.updateHiringRequest` (the latter skips its own position sync when joined); the same transaction spans the Tethr and client workspaces because both live in one Postgres database and the tenant switch is context, not connection — `PlatformScopeService.switchTo` already audits each crossing. The employee-number collision retry now wraps each attempt in a savepoint (a unique violation would otherwise poison the transaction). Separately: **closed postings no longer mint live applications** — the intake consumer checks `isPublished` and `closesOn`, and a late submission is stored with `status = 'rejected'` and a human reason instead of silently vanishing (no application is created). **Resume metadata can no longer be forged**: `prepareFileUpload` persists a `FormUploadTicket` (form, field, key, content type, size, expiry), submission only accepts an unused/unexpired ticket that matches the declared metadata *and* verifies the object really exists at that size via the new `StorageDriver.statObject` (local `fs.stat`, Supabase object-info), and the ticket is claimed in the same transaction that inserts the submission. The final-settlement consumer now logs and **rethrows**, so the outbox retry policy (5 attempts) applies instead of marking a failed settlement processed forever. Anonymous-form rate limits became configuration (`FORM_SUBMIT_LIMIT_PER_10_MIN` default 10, `FORM_UPLOAD_LIMIT_PER_10_MIN` default 30). Verified: 199 API tests green plus a dedicated hardening suite 7/7 (concurrent-acceptance race → one employee, closed-posting rejection with reason and zero applications, forged resume refused, live posting still projects), and the full E2E set re-run green (M5 8/8, M6 10/10, cross-workspace 10/10, M7 10/10, M8 9/9, M9 9/9).

**Deployment-readiness pass (same day):** the schema finally has a **baseline migration** — `1789390244861-InitialSchema.ts` creates the entire schema (the ATS tables included) and was generated against an empty database, then verified by applying it to a scratch database and diffing the result against the synchronize-built dev schema: **1007 columns, 0 missing, 0 type/nullability/default differences** (the only extra table is TypeORM's own `migrations` ledger). Two things surfaced on the way: the data-source entity glob only loads `*.entity.ts`, so `tax-slab.entities.ts` (working at runtime via `autoLoadEntities`) was invisible to the CLI and its tables were missing from the first generation — the file is now `tax-slab.entity.ts` per convention, and the README documents the trap; and the baseline now opens with `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` so it applies to hosts whose template database lacks it. A synchronize-created database (every dev DB so far) marks the baseline with the new `migration:run:fake` script instead of executing it. Separately, **audit writes can now join an open transaction**: `AuditService.record(input, manager?)` and an optional `manager` on `PlatformScopeService.switchTo` mean the platform-switch audits raised during offer acceptance (and the hire's `employee.created` and `hiring_request` audits) commit or roll back with the hire, instead of surviving a rollback and describing work that never happened — the switchTo docs were updated to say so, and the non-transactional board reads keep their audit-before-work behaviour.

**Still deliberately open (not silently dropped):** Supabase Storage is unverified until credentials exist (the local driver implements the same interface); CV parsing is the stubbed `parse-cv` seam (manual scoring drives ranking today); postings have no list page/auto-close scheduler (`isPublished` + `closesOn` are already derived liveness); the employee photo/invoice-logo base64 pattern has not migrated to object storage; Tethr-raised requests cannot yet target a client workspace from the UI (the board can act on client rows, but request creation still lands in the caller's own workspace); the form-builder operator API (`formDefinitions`/`createFormDefinition`/`createFormLink`) is API-only until a builder UI exists; and a few fields are intentionally write-only seams for later phases (`Candidate.consentGivenAt`, `JobPosting.publishSalaryRange`, `FormSubmission.targetRef*`, `Shortlist.closedAt` is now shown).

## ATS — M4–M6: requisitions, the form builder, and the ATS core (2026-09-14)

The intake cycle now runs inside the product: a client briefs a role, Tethr publishes a posting with a signed apply link, an anonymous candidate submits with a CV, and the applicant lands as a candidate + application ready to rate and move through the pipeline.

**M4 — the request is a real requisition.** `HiringRequest` gained the briefing fields the client actually gives us (`jobDescription`, `salaryMin`/`salaryMax`/`salaryCurrency`, `hiringManagerEmployeeId`, `reportsToEmployeeId`, `priority`, `targetFillDate`) plus a linked `positionId`. The seven-state union shrank to `submitted → open → onHold → filled → cancelled` with an explicit transition map in the service (illegal moves are a `ConflictError`, verified for `submitted → filled`) and `HIRING_REQUEST_STATUSES`/`HIRING_REQUEST_PRIORITIES` in `@hrms/shared` now drive the DTO and the web maps (the old literals are gone from the dashboard widget too; `backfill:hiring-statuses` migrates legacy rows). Opening a request ensures and links a Position (and reopens it); filling or cancelling closes it. Tethr-internal notes never cross the portal line: clients get `tethrNote: null` and tethr-authored trail notes are masked. The Tethr `/hiring` page now reads the platform board (`clientHiringRequests` — every client workspace plus Tethr's own, audited per switch) with a workspace column and filter; the client page stays tenant-scoped. Browser: 7/7 (client UI submit with briefing fields, board row + workspace label, illegal transition refused, open links a position, notes masked).

**M5 — the generic form builder, with the application form as first consumer.** New `modules/forms`: `FormDefinition` (name, slug, status, target), `FormField` (type, label, required, options, order, `mapsTo`) and `FormSubmission` (answers + file references + metadata), all tenant-scoped. The public surface is three unguarded-but-token-verified operations (`formByLink`, `prepareFormFileUpload`, `submitForm`) that verify the signed link and then run inside that link's tenant; a per-form/IP sliding-window rate limiter blunts abuse. The apply page (`/apply/:token`, public route) renders whatever the definition says and uploads files straight to signed storage. `ensureApplicationFormDefinition` seeds the standard 14-field template with `mapsTo` targets (`candidate.email`, `application.coverNote`, `document.resume`, …) — the Notion columns are now configuration. Browser: 8/8 (seeded template, minted link, forged token refused, required-field validation, anonymous submission with a CV, submission row persisted with the form's tenant).

**M6 — the ATS core.** `JobPosting` (created in Tethr's workspace from a request; `sourceHiringRequestId` + `sourceOrganizationId` by id; publish flags mirror the disclosure decision), `Candidate` (one row per person, email-unique per workspace — the cross-client pool Frappe lacks), `Application` (stage / outcome / hold as separate facts; snapshot columns keep what the candidate said at submission time), `CandidateDocument` (versioned CVs in object storage) and `CvParse` (the AI seam, created `pending` with a `parse-cv` job enqueued). One "Publish & get apply link" action on the request panel publishes the posting, seeds the form and mints the signed link carrying the posting as context. A `form.submitted` consumer projects the submission: `mapsTo` fields become the candidate (find-or-create by email, latest known facts) and the application snapshots, the CV becomes a `CandidateDocument`, and a `parse-cv` job reaches the worker. The `Candidates` tab (Tethr-only nav item and route, `candidate:read`/`candidate:manage` — never granted to client roles) lists the pool, shows each candidate's applications, and edits stage/outcome/rating. End-to-end: 10/10 (client brief → open → publish → signed link → anonymous apply with CV → event-relay projection → candidate + application with snapshots and `hasResume` → stage/rating update → client refused the pool → parse-cv processed by the worker).

**Board write path (review follow-up).** The Tethr board could *read* every workspace but its write actions were tenant-scoped: publishing or opening a client's request looked it up in Tethr's own workspace and failed `NotFound`, so a client-submitted brief could not actually be driven from `/hiring`. `publishHiringRequest`/`updateHiringRequest` now accept the row's `organizationId`, re-verify `assertOperator(hiringRequestManage)`, and run the request-side work under `PlatformScopeService.switchTo` (audited per switch); the posting still lands in Tethr's workspace and the apply link keeps the posting's tenant. The `form.submitted` projection was also hardened: a retried event reuses the application already linked to the submission (no duplicate), skips a CV already stored under the same key, and clips untrusted answers to their column widths/types (a malformed years-of-experience or currency no longer fails the write). The public `PublicForm` type no longer exposes `mapsTo`, and the rate limiter bounds its key map. API tests: 180 passing.

**Known gaps at this checkpoint:** shortlists (M7), interviews (M8) and offer→hire (M9) are not built yet; the postings list UI, posting auto-close scheduling and the CV comparison view come with them. Supabase Storage remains on the local dev driver until credentials exist.

## ATS foundation — M1–M3: tenant-safe public surface, real storage, jobs/outbox/channels (2026-09-14)

First checkpoint of the end-to-end hiring cycle ([recruitment-ats-plan.md](recruitment-ats-plan.md) now carries the execution plan). **M1 — the tenant hole is closed and platform scope exists.** `TenantContextMiddleware` is bearer-only: the unverified `x-organization-id` fallback is gone (nothing in the repo used it). `FormTokenService` mints/verifies `{type:'form-link', formId, organizationId}` links — deliberately no `sub`/`org`, so `readToken` can never promote one to a session; `PlatformScopeService` (own global module) provides the one sanctioned cross-tenant mechanism: `assertOperator(permission)` (caller org `kind === 'tethr'` **and** permission), `listClientOrganizationIds()`, `resolveTethrOrganizationId()`, and `switchTo()` — audited before the switch, then running work with the tenant pointed at the target while keeping the caller's principal. `platform:read-all` joins `PERMISSIONS`, is granted to `tethrAdmin` (via `ALL_PERMISSIONS`) and explicitly to `tethrHr`, and the additive `sync:role-permissions` backfilled existing role rows. `Organization.kind` is now a real invariant: a partial unique index (`organizations_single_tethr_workspace`), `OrganizationService.markAsTethr`, seed-demo marks its Tethr workspace, and `npm run mark:tethr-workspace -w @hrms/api -- --email <admin> [--move]` backfills (dev DB points at Smoke Finance Co).

**M2 — object storage is real, behind a driver interface.** `STORAGE_DRIVER` picks `supabase` (signed upload/download URLs over the Storage REST API, service-role key server-only) or `local` — a dev-only driver that writes to `./.local-storage` and serves bytes through the API's first REST controller (`/storage/local/upload|download`, HMAC-signed links; refused in production by config validation). `StorageService` is the only seam `DocumentService` sees: `prepareUpload`/`prepareDownload` now return real signed URLs and `buildStorageKey`/the metadata schema are unchanged. The employee documents UI lost the editable "storage key" field: pick a file, the browser PUTs the bytes to the signed URL, and the attach/version mutations use the server-issued key with the file's real size. `PUBLIC_API_URL`, `SUPABASE_*`, `STORAGE_SIGNED_URL_TTL_SECONDS` are env shape. Verified with a 5 MB PDF: upload → attach → signed download → byte-for-byte hash match. Supabase itself is unverified until credentials exist — flipping `STORAGE_DRIVER` is the only change needed.

**M3 — jobs, the outbox relay, and the first real channel.** `JOBS`/`QUEUES`/`JobPayloads` moved to `@hrms/shared` so API and worker share one typed contract; the worker listens on `hrms-default` and carries the `parse-cv` stub processor (the AI seam). The API gained `bullmq` behind `core/queue/MessageQueueService` (lazy connect, typed `add`), and `OutboxRelayRunner` drives `OutboxRelay.relayPendingBatch()` on an interval inside the API process (where the in-process `EventBus` consumers live) — `OUTBOX_RELAY_INTERVAL_MS`, default 5s, disabled in tests. On first boot it delivered the 124 domain events accumulated since the outbox was introduced (previously every one sat `pending` forever). `NotificationService` now has real transports: Resend over HTTP (`RESEND_API_KEY`, `EMAIL_FROM`) and a Slack incoming webhook (`SLACK_WEBHOOK_URL`), each falling back to a logger transport without credentials, plus a tiny typed template registry. The first consumer (`hiringRequest.submitted`) re-establishes the tenant from the event, dedupes via the processed-events ledger, and posts the Slack alert. Also fixed while verifying: `EmployeeProfilePage`'s `offboardingTasks` fallback created a fresh `[]` every render and its sync effect looped (now memoized).

**Checkpoint verification:** typecheck/build clean; lint 0 errors (72 warnings, all pre-existing import/order); tests 161 API / 20 shared / 5 UI. Live: relay drained 124/124 outbox rows (0 pending) with the consumer making one idempotent pass, an API-enqueued `parse-cv` job processed by the worker, and the 5 MB storage round trip hash-matched through the browser UI (8/8 checks).

## Twenty-grade UI pass — Phase 6: the view bar + inline record creation (2026-09-13)

Two shared layers landed. **`DataTable`** (`components/table/DataTable.tsx`) is driven by column definitions and owns what every list hand-rolled: the colgroup, `ColumnHeaderMenu` sort/hide wiring, client-side multi-sort, hidden columns, in-shape skeletons, the empty-state cell's colSpan computed once, `data-label` for the ≤760px stacked cards, row selection, and a pinned draft row. It replaced the tables on Employees, Payroll, Billing (groups/rates/invoices), Leave, Feedback, Hiring, Clients, and Workspace users; the duplicated sort/`hiddenColumns` state in Payroll and Billing is gone. **`useListView`** (`components/view-bar/useListView.ts`) makes the query string the source of truth (`?filter[status]=active&sort=hireDate:desc&hidden=role&view=<id>`), with named presets in localStorage keyed by route. **`ViewBar`** assembles each list's header — view chip with live count, Filter, multi-sort, Options (Fields with the name column pinned, Copy link to view, Create custom view), a Save view affordance only when state differs from the loaded preset, and locked built-in views. Field visibility commits immediately; filters/sorts stay local until saved, and the copy-link round-trips exactly.

**Inline creation** uses collect-then-create (nothing reaches the server until valid) with `SidePanel`'s new `headerContent` name fields and `components/record-panel/` primitives (`FieldRow` click-to-edit with Enter/blur commit and Escape discard, typed controls, `FieldGroup`, one `onCommit` seam, `useInlineCreate`). Rolled out to **Employees** (the full-page onboarding takeover is retired; the panel collects the same grouped fields, then autosaves per field via partial `updateEmployee`; `employeeNumber` is read-only after create, and the panel is read-only without `employeeWrite`), **Hiring requests** (the panel create now serves both portals — clients raise requests for their own workspace, Tethr staff can raise them on their behalf, and the trail's first entry is attributed to the portal that created it; single-commit), and **Invoice expense lines** (the full loop: draft row → create blank → edit each field via `updateInvoiceLine` → delete). The panel is preview-and-edit; the employee name link still opens the deep profile page. Clearing a field now works end to end: `updateEmployee`'s resolver distinguishes an absent field (leave alone) from an explicit `null` (clear) instead of collapsing both. Clients, Announcements, and everything under `/settings` deliberately stay modal/full-page institutions.

**Org chart navigation** (same pass): the directory search no longer filters the chart — every employee stays on screen, matches get an accent ring, non-matches dim to 45%, and only the ancestors of a match are temporarily expanded to reveal it, so unrelated collapsed branches stay closed (the user's own collapse state returns when the query clears). The chart auto-centres the first match, and a floating control offers zoom out / live percentage / zoom in (50–200%) plus a "centre on match" button. Zoom scales the canvas itself: a measured sizer reserves the scaled extent so the scroll area grows and shrinks with the content, the canvas is transform-scaled around its top-left, and the point at the centre of the viewport stays put while zooming. A trackpad pinch (Ctrl+wheel) zooms around the cursor; plain wheel keeps scrolling. Expand/collapse animates the reports' auto-height (grid-row 0fr→1fr, 240ms) and collapsed subtrees are kept inert. The viewport stays put when a branch is toggled — the canvas is centred once per freshly loaded tree, so expanding or collapsing no longer drags a wide chart back to the middle. The seeded org chart (`npm run seed:org-chart -w @hrms/api -- <email>`) gives Smoke Finance Co a five-level tree to exercise it.

**Workspace users moved into settings** (same pass): the People sub-nav no longer carries a Users pill — `/settings/members` is the single home (the page is titled **Members**), the client workspace and the dashboard checklist link there, and the standalone `/users` route is retired. The role editor now wraps its selects/Save inside the cell instead of bleeding into the next column.

**Group pills expand the section strip** (same pass): clicking a People / Finance / Engage pill no longer opens a dropdown — it animates the second row open with that group's tabs (`grid-template-rows` 0fr → 1fr, 240ms, with the tab row fading in), and clicking the expanded pill folds it away. Collapsing animates just like expanding: the tab row stays mounted through the fold (latched to the last shown group) and only goes inert once hidden, so the height eases down instead of snapping. An open strip also folds on an outside click — clicking anywhere in the page content collapses it (after the click has been dispatched, so e.g. a table-row click still lands), while clicks in the top bar (e.g. the workspace menu) leave it open, and even a route's auto-shown strip folds the same way (navigating re-opens the destination's section). Landing on a route snaps the strip back to that section's group, and the section you're actually in keeps the white "you are here" pill while a browsed group reads as a tinted, caret-up pill. The group dropdowns (and their CSS) are gone; the mobile drawer is unchanged.

**Settings surface + workspace menu** (same pass): settings now open as their own full-screen surface (Twenty's shape) — a grouped left sidebar (**Workspace**: General / Members / Billing / Payroll / Pay, role-filtered) with the close action, a **Theme · Light/Dark** switch, and **Log out** at the bottom, and the active section on the right under a `Workspace / Section` breadcrumb. Closing returns to the last app page (remembered by the shell) or the portal home. The workspace banner in the top nav is now the workspace menu (workspace identity, Theme, **Invite user** for user admins, **Settings** for anyone with a settings section, **Log out**, plus **Switch workspace** when another exists); the topbar's theme button and account avatar menu are removed, so the workspace menu is the single account surface and the account-dropdown CSS is retired. Below 900px the sidebar becomes a wrapping horizontal strip above the content.

**Gates:** typecheck/lint/build clean; tests 128 API / 20 shared / 5 UI; browser 19/19 Phase A (view bar, hide column + colSpan, header/menu sort agreement, share-link round trip, preset save/switch, built-in lock, dark, ≤760px cards) + 6/6 employee create (draft row, Escape creates nothing, one create, one-field autosave, unchanged blur sends nothing) + 4/4 hiring + 5/5 invoice loop + 6/6 existing panel consumers + 7/7 org chart (subtree render, collapse hides branch, search highlight/reveal, collapse restore, zoom, scroll position kept across toggles) + 6/6 nav active-state (org chart vs employees across tabs, dropdown, drawer) + 5/5 sub-nav strip (mid-fold height, page-click folds, top-bar click stays open, auto-shown strip folds, tab click keeps the section open) + 5/5 review-fix checks.

## Twenty-grade UI pass — Phase 3: filters as chips (2026-09-13)

New shared `FilterBar` (`components/filter-bar/FilterBar.tsx`): nothing permanent while resting (a single light "+ Filter" button), each applied filter materializes as a removable 24px accent-tinted chip that is itself the dropdown trigger for re-editing, and the whole row disappears when nothing is applied. A filter with no options renders no chrome at all (an empty client portfolio shows no currency filter). The old always-visible employees `DirectoryFilterMenu` is deleted and the directory now uses the shared bar. Rolled out to Employees (status/worker type), Leave triage (status/type), Feedback (status/category), Hiring (status), Payroll runs (status), Billing invoices (status/group) and members (group), Clients (currency), Workspace users (role/status), and Announcements (audience), each with a "no matches" empty state that clears the filters. Time-attendance's required employee/date selects are deliberately untouched.

**Gates:** typecheck/lint/build clean; tests 127 API / 20 shared / 5 UI; browser 6/6 (FilterBar mechanics) + 25/25 (rollout across nine routes).

## Twenty-grade UI pass — Phase 4: a real `/settings/*` area (2026-09-13)

Settings is now its own routed area with a settings-scoped sub-nav (`SettingsLayout`), replacing the "modal wearing a page costume" pattern: **General** (the workspace brand-color swatches, moved out of the account dropdown), **Members** (the workspace-users page), **Billing** (commercial terms, letterhead uploads, and both addresses — the 127-line modal is gone; the Billing page now links to it), **Payroll** (the withholding tax ladders, moved off the runs list), and **Pay** (pay components + salary structures, moved off the top of `/compensation`). `/compensation` is now a data page — salary history with the revise-salary modal, a "Manage pay setup" link, and a two-card summary. The account dropdown keeps a "Workspace settings" link for admins only; the sub-nav and per-tab route guards mirror each page's API permission (tethrFinance sees Billing/Payroll, tethrHr sees Pay, and admin-only tabs stay admin-only).

**Gates:** 11/11 browser checks (tabs, every panel, the three entry-point links, compensation's new shape, admin-only access).

## Twenty-grade UI pass — Phase 5: getting setup UI off the face (partial, 2026-09-13)

Landed: `TimeAttendancePage`'s two permanent admin forms are now trigger buttons opening `Modal`s (record hours, open timesheet); `WorkspaceUsersPage`'s inline create form is a `Modal` and its permanently reserved 500px empty gutter is gone (the page is single-column); `PayrollRunDetailPage`'s "Finalize checklist" aside no longer duplicates the header Finalize button; `InvoiceDetailPage`'s "Add pass-through line" form is behind an "Add line" button in a `Modal`; and the three decorative metric cards (Announcements portal/access, Feedback "Selected", Leave "Mode") were dropped.

**Still open (deliberately deferred, not silently dropped):** `EmployeeProfilePage`'s eight permanently-expanded write forms (revise salary / award bonus → modals, document uploads → one modal, HR record / organization / assessment behind the existing `showEdit` toggle); `MyProfilePage`'s read mode; `WorkspaceUsersPage`'s in-cell role editor → `SidePanel`; the `ClientPortfolioPage` aside and `ClientWorkspacePage` quick-actions; and `/compensation`'s employee picker (it still defaults to the first employee; the picker lives inside the revise modal).

**Gates:** 9/9 browser checks (attendance modals open/close, users create modal + full-width content, single Finalize, invoice modal).

## Twenty-grade UI pass — Phase 2: column menus, hover actions, mobile labels (2026-09-13)

- **Column header menus.** New `ColumnHeaderMenu` (`components/table/ColumnHeaderMenu.tsx`) makes the whole `<th>` the trigger for sort ascending / sort descending / remove sort / hide column, with the direction caret only visible on hover or when active. The panel is portaled to `document.body` with fixed positioning because the table's `overflow: auto` scroll container would clip an absolute one; it closes on outside click, Escape, and any scroll. Rolling it out retired the hardcoded sorts: Payroll runs (period / working days / status / finalized) and Billing invoices (number / group-type / covers / total / status / due) now sort from the header, hidden columns drop out of the colgroup and body together, and a "Show N hidden columns" link restores them.
- **Hover-revealed row actions.** Secondary per-row actions (remove billing member, remove payroll line, remove invoice line, client invoice downloads) are now invisible at rest and fade in on row hover or keyboard focus inside the row — gated behind `@media (hover: hover)` so touch keeps them visible. This composes with the Phase 1 hover background.
- **Labeled mobile cards.** Every table named in the audit (Billing's three, Payroll runs/lines/payslips, Invoice detail, Compensation's three, Users, Leave, Feedback, Hiring, Client workspace) now carries `data-label` on each cell, so the ≤760px stacked-card mode reads real column names instead of an unlabeled `·` run.

**Gates:** typecheck/lint/build clean; tests 127 API / 20 shared / 5 UI; browser 8/8 (menu portal, sort reorder, caret, hide/restore on Payroll and Billing) and 9/9 (mobile labels on six routes, hover-reveal at rest and on hover).

## Twenty-grade UI pass — Phase 1: shared primitives (2026-09-13)

First phase of the UI upgrade planned against Twenty (the target `design.md` already names). All changes verified headless at 1440px in light and dark.

- **Table overhaul (1.1).** `.data-table`/`.employee-table` rows are now 32px at 13px (`--hrms-layout-table-row-height`/`--hrms-layout-table-font-size`, new `layout.table` tokens), sticky headers pinned at the row height in tertiary gray (uppercase dropped), vertical hairline borders, hover via `--hrms-color-background-tertiary` gated behind `@media (hover: hover)`, selection as `--hrms-color-accent-accent3` (visibly distinct from hover for the first time), and a new `.cell-numeric` (right-aligned + `tabular-nums`) on money/count/hours columns. The arbitrary `min-width` floors were dropped where `<colgroup>` now supplies real widths, and `<colgroup>`s were added across the list and finance tables. The four `SidePanel` pages were regression-checked.
- **Scrollbars + scroll shadows (1.2).** App-wide `scrollbar-width: thin` with themed thumbs, hidden on coarse pointers; the double scroller is gone (`.modal-backdrop` no longer scrolls, only `.modal-body`); and `.data-table-wrap`/`.employee-table-wrap` get a pure-CSS horizontal scroll shadow via `background-attachment: local` covers — no scroll listeners, no re-renders.
- **Skeletons and empty states (1.3/1.4).** New `Skeleton`/`SkeletonRows`/`SkeletonText` (`components/skeleton`) render **inside the real `<tbody>`/`<colgroup>`**, so data arrival causes zero reflow; static bars in tables, shimmer on cards/panels. New `EmptyState` (`components/empty-state`) promotes the icon + title + copy + one cause-matched CTA pattern; the broken `.table-empty` padding is fixed, and every list page (Employees, Payroll, Billing, Compensation, Attendance, Users, Clients, Leave, Feedback, Hiring, Announcements) now uses skeleton + empty state instead of the five ad-hoc "Loading…" strings.
- **`StatusChip` (1.5).** One component maps a domain color + human label; the eight duplicated `chipStyle` helpers and five raw inline chip objects are gone, including the `WorkspaceUsersPage` "always green" bug and raw camelCase labels (`inProgress`, invoice `status`).
- **Buttons and controls (1.6).** `.button-sm` (24px) joins the 32px default, `text-decoration: none` lives on `.button` itself (three patches deleted), input heights collapsed to 32px (the 34/36/40px overrides and the duplicate `.access-role-control select` are gone), and the `✕` glyph buttons became `IconX`.
- **Small correctness fixes.** Compensation no longer flashes "No pay components yet" on first paint; Billing no longer prints `0` while loading; the dead notifications bell is removed; the Hiring modal's duplicated error paragraph is gone; and the payroll finalize override reason is a proper `Modal` instead of `window.prompt()`.

**Gates:** typecheck/lint/build clean; tests 127 API / 20 shared / 5 UI; browser 15/15 (row height/font, sticky header, hover vs selection, thin scrollbars, in-shape skeleton, numeric alignment, humanized chips, empty state, dark mode) plus the four `SidePanel` pages.

## Row detail as a sliding side panel (2026-09-12)

Employees, Feedback inbox, Leave triage, and Hiring requests replaced their always-visible preview rail with a Twenty-style push panel: closed by default, the row click slides a 500px panel in from the right as a **flex sibling** (no backdrop, no scroll lock — the list reflows narrower and stays clickable). New shared `SidePanel` (`packages/web/src/components/side-panel/SidePanel.tsx`): width-transition on the outer `<aside>` using the existing `layout.sidePanelWidth` token + `animation.duration.normal`, fixed-width body so content doesn't reflow mid-animation, latched children so content survives the close transition, Escape + header-button close, focus restore. CSS collapsed to one `.list-with-panel` layout + one `.side-panel` chrome copy (deleting `.hiring-page`/`.feedback-page`/`.leave-page` and their panel classes plus their duplicated media rules; `.page-frame`/`.employee-detail-panel` stay for Billing/Payroll/Compensation and the two routed detail pages). Hiring's client-only "New request" form moved out of the rail into the shared `Modal`, triggered by a header button, so clients keep the ability to submit. The same treatment was then applied to **News bulletin**: its "Publish update" rail is gone, replaced by an "Add announcement" header button opening the publish form in the shared `Modal` (readers see no button). While verifying, a focus bug surfaced and was fixed in both `Modal` and `SidePanel`: their open/close effect depended on the inline `onClose` handler, so it re-ran on every keystroke and stole focus back to the dialog after the first character. Both now read `onClose` through a ref. Verified headless: all four panel pages (52 checks), News bulletin publish flow end to end (9 checks), and modal typing/side-panel close regressions (5 checks).

## Dead-code sweep (2026-09-11)

Scanned with `knip` plus a custom import resolver (files never imported) and a CSS class-usage scan, then verified every candidate before deleting. `noUnusedLocals`/`noUnusedParameters` were already on, so local dead code was already covered; this pass removed unused files, exports, dependencies, and CSS.

- **20 unused files deleted:** 18 `index.ts` barrels nothing imported (`core/{audit,auth,authz,config,database,events,notifications,tenancy}`, `core/database/entities`, `modules/{account,assignment,attendance,engagement,organization,position,recruitment}`, `finance/{billing,fx}`), plus the worker's unused `MessageQueue` abstraction and the web's unused `selectedEmployeeIdState` atom.
- **Dead symbols removed:** `ImmutableRecordError`, `monthStart`, `workingDaysInMonth`, `downloadCsvFile`, the unused `formatDateTime`/`formatMoney`/`daysUntil`/`today` exports on `employee.shared`, and the orphaned `QueueName` type. Unused re-exports were pruned from the 8 barrels that *are* consumed (workflow, employee, errors, documents, leave, employee-records, payroll, compensation).
- **15 dead web GraphQL operations deleted** (education/work-history CRUD, personal-details, assignment-history, update-invoice-line, tax-slab group/replace, self-service personal details/education/work history). Their backend resolvers are untouched.
- **2 unused worker dependencies removed:** `ioredis` (bullmq brings its own) and `reflect-metadata` (the worker has no decorators/TypeORM).
- **CSS: 51 dead rules and 24 dead selectors removed from `global.css`** (−336 lines) — the old sidebar/nav shell, activity feed, self-service panels, segmented controls, and similar leftovers. Kept `.modal-dialog-{sm,md,lg,xl}` (built dynamically via `modal-dialog-${width}`).
- **Over-exported symbols de-exported:** knip's `--fix` (v6) removed the `export` keyword from ~116 symbols that nothing outside their defining module referenced — service input/contract types, in-file helper types, and unused GraphQL view-class exports. Knip 5 had flagged ~103 of these; knip 6's reporter is more conservative (it treats types in exported signatures as public API) but its fixer still applies them, and they all remain live and in use within their files. No code was deleted by the fixer.
- **Deliberately kept:** `core/database/data-source.ts` — referenced by the TypeORM migration npm scripts (`migration:generate/run/revert`), a knip false positive; it is now the only remaining knip finding.

**Gates:** typecheck/lint/build clean; tests 127 API / 20 shared / 5 UI; headless browser smoke 15/15 after the sweep.

## Finance pages: setup forms moved into modals (2026-09-11)

The always-visible right rail on all three Finance pages (`/compensation`, `/payroll`, `/billing`) is gone. Each setup form now opens on demand from a trigger button, via a new shared `Modal` component (`packages/web/src/components/modal/Modal.tsx`) — body portal, backdrop from `--hrms-color-background-overlay-primary`, Escape/backdrop/close-button dismissal, focus return, scroll lock, and `modalWidth` sizes. Compensation: "New component", "New structure", and "Revise salary" buttons; Payroll: "New run" and "Manage tax slabs"; Billing: "Billing settings", "New group", "Assign rate", "Open expenses draft". The Finance `<main>` uses a single-column frame now that there is no rail. Also fixed the two 4-column Compensation summary tables' phantom horizontal scrollbar — `.compensation-grid .data-table { min-width: 0; }` drops the blanket 640px floor that the narrow 2-up cards couldn't meet. Verified headless (puppeteer) at 1440px and 1000px: rail gone on all three pages, every trigger opens its modal, Escape and backdrop-click close, and both Compensation tables report `scrollWidth === clientWidth`. Typecheck/lint/build clean; 152 tests green.

## Code-review fixes on the finance interconnection work (2026-09-11)

An 8-angle review of the Phases 0–4 diff surfaced ten findings; the money/data-integrity ones are fixed, each with a regression test.

- **Final settlement now pays every adjustment kind, taxed like a payslip (findings 1 & 2).** It previously read only `advanceRecovery`, silently dropping bonuses/arrears owed in a leaver's final month, and applied no withholding. `FinalSettlementService.compute` now folds all period `PayAdjustment`s in (earning kinds add, deduction kinds subtract, each pro-rated by its `dependsOnPaymentDays`), computes taxable base, and applies the active tax ladder via the same `calculateMonthlyWithholding` engine as regular runs. New columns: `adjustmentEarnings`, `taxableAmount`, `incomeTaxAmount`, `netPayableAmount`.
- **Billing membership can no longer be double-booked (finding 3).** The effective-dating move dropped the `(org, employee)` unique index and never replaced the overlap rule. Added a Postgres **partial unique index** (`validTo IS NULL`) as the race-proof backstop, plus a service-level `rangesOverlap` guard mirroring `AssignmentService` that returns a clean conflict first.
- **Payroll eligibility has one source (finding 4).** Readiness and draft generation each recomputed eligibility independently and could disagree. Both now derive from one `computePayrollBasis`; the readiness banner and the run are computed from identical facts.
- **`createAdjustment` enforces kind↔category (finding 5).** An `advanceRecovery` on an earning component used to silently add money; earning kinds (`bonus`/`encashment`/`arrear`) must use earning components and `advanceRecovery` a deduction component.
- **Per-employee work is parallel and scoped (finding 6).** The readiness/draft loops were sequential per employee (N+1) and the record's Pay tab triggered a tenant-wide computation. Basis computation now runs under `Promise.all`, and a new `employeePayrollReadiness(employeeId, …)` query computes a single person; the hub uses it.
- **`updateRunLine` no longer double-applies a day delta (finding 9).** When `payableDays` and `lopDays` are edited together, `payableDays` is authoritative and the invariant `payable + unpaid ≤ standard` is kept; the lop delta is applied only when unpaid days are edited alone.
- **Finalize distinguishes a zeroed period from legitimate zero pay (finding 10).** A line with payable days but zero earnings now needs an explicit override (e.g. a bad holiday calendar), while a genuinely idle month (no payable days) still passes.
- **Bank change requests ride the workflow engine (finding 7).** Requests create a generic `ApprovalRequest` (`subjectType 'bankDetailChange'`) and decisions go through `WorkflowService.decide`, so there isn't a second bespoke approval mechanism. (`LeaveRequest` does not itself use the engine today — the shared engine was previously unwired.)
- **`PayAdjustment` is deliberately period-scoped (finding 8, not changed).** It models a specific pay period (`periodYear`/`periodMonth`), matching Frappe's `Additional Salary`/`payroll_date`, not an open-ended effective-dated fact; the recurring mode carries its own half-open window. Documented on the entity.

**Gates:** typecheck/lint clean; **API tests 127 passing** (5 new regression tests); build clean; `employeePayrollReadiness` and the recomputed final settlement smoke-verified live.

## Finance ↔ employee-record interconnection (2026-09-11)

Implementing "Making Finance and the Employee record one system". **Phases 0–2 are complete and verified; Phase 3 is partial; Phase 4 is not started.**

- **Phase 0 — money corrected (verified end to end).** Pay components gain `dependsOnPaymentDays`; payroll now pro-rates each resolved component by `payableDays / standardWorkingDays` and stores the pair (`defaultAmount` + `amount`) plus the per-line denominator on run lines and `payslip_lines`. `grossAmount` is the sum of the pro-rated earnings, not the raw monthly gross. `updateRunLine` re-pro-rates from the stored default when days change (editing LOP shifts payable days by the delta); finalize refuses a line with no earning components; `BillingGroupMember` is now effective-dated (`TemporalEntity`) with an `employee.terminated` consumer that closes the open membership and a drafter that bills only memberships overlapping the service month; payroll honours each employee's own holiday calendar. Smoke: a full month stays `100000`, `payableDays` 10/21 re-prorates to `47619.05`, and a terminated-mid-month employee is billed the partial month only.
- **Phase 1 — readiness spine.** `SalaryRevision` is now a required assignment (unassigned employees are excluded from the run, not paid zero); `SalaryStructure.defaultAnnualAmount` pre-fills grade defaults (one active structure per grade enforced); a `payrollReadiness(periodYear, periodMonth)` query reports per-employee hard blockers (`noPayAssignment`, `structureHasNoComponents`) and warnings (`missingBankDetails`, `noActiveTaxLadder`); a banner on `/payroll` and the run detail links each blocked name to the record; finalize blocks on hard blockers with a recorded override reason; the `bankDetails` onboarding task is derived from the actual bank fields. Billing readiness is deliberately a separate concern (billing depends on payroll, never the reverse).
- **Phase 2 — events and one choke point.** `PayAdjustment` (bonus / encashment / advanceRecovery / arrear / correction / other, with `sourceType`/`sourceId` provenance and optional recurring window) is the single path for period money changes; awarding a `BonusAward` now creates one, so bonuses are actually paid and appear as a `bonus` component carrying provenance. `compensation.revised` flags draft runs stale (`isStale`/`staleReason`, cleared on regenerate); `employee.terminated` closes the open salary revision after the last day. `FinalSettlement` computes and stores the full-and-final figure (pro-rated final month + leave encashment from the leave balance + recoveries) on termination. Shared effective-dated `FX` (`modules/finance/fx`) lands under the Finance wrapper. Smoke: a `25000` bonus flowed into a draft run as `bonus` / `bonusAward/<id>` and gross rose to `125000`.
- **Phase 3 — done.** Employee names in finance link to the record (payroll run lines, issued payslips, invoice lines, billing rate rows). Payroll run lines now carry HR context (role, hire date, status). The **Job & pay** tab is a real hub: pay-readiness chip, salary-history timeline, payslips with PDF + "open run" deep link, bonuses/adjustments with provenance, and a billing rate + **margin** panel (billed USD vs cost converted at the effective FX rate, with a negative-margin warning) — role-gated to `tethrAdmin`/`tethrFinance`. IA fixes: the group sub-nav strip stays on detail routes (`/payroll/:runId`, `/employees/:employeeId`, `/billing/:invoiceId`), ⌘K is a real jump-to (pages, employees, payroll runs, invoices), and the revise-salary structure select shows an empty state linking to `/compensation`. Deliberately skipped: invoice lines still show only name/month (no per-line role/hire), and the "warn on the revise form when a raise crosses the billed rate" check lives in the hub's margin panel rather than blocking the form.
- **Phase 4 — done (except one item).** Self-service payslips expand to a per-component breakdown (`defaultAmount` → pro-rated `amount`, the paid-day ratio, LOP, provenance) plus a **year-to-date** gross/tax/net summary; the admin run-line breakdown shows the same `default × days/days` working. Self-service profile adds a **Pay history** card (raises and one-off payments with effective dates) and a **Bank details** card: the employee sees the account their pay goes to and *requests* a change, which HR approves or rejects from the record's Job & pay tab (a payment instruction, never a direct edit; approval writes the HR record's bank fields). The **client portal** now shows per-employee billed cost and a spend trend on screen, not only in the addendum PDF. Deliberately skipped: mounting `DashboardWidgetBoard` on `/me` (the employee surface was intentionally reduced to five destinations — see the 2026-09-09 section), and naming/linking the specific leave requests behind LOP days (would require a new published leave read across the payroll boundary).

**Gates:** typecheck/lint clean across all packages; **API tests 122 passing**; build clean; Finance/self-service/client queries (`payrollReadiness`, `employeePayslips`, `myPayslip`, `mySalaryRevisions`, `myBonusAwards`, `myPayAdjustments`, `myBankDetails`, `requestMyBankDetailChange`, `bankDetailChangeRequests`, `decideBankDetailChange`, `clientCostBreakdown`, `exchangeRates`) smoke-verified live.

## Payroll, Billing, and Compensation nested under Finance (2026-09-11)

The Finance group now lives under `modules/finance/` and holds **Compensation (the nav's "Pay"), Payroll, and Billing** — each still a separate self-contained module, composed by a thin `FinanceModule` wrapper, matching the nav's existing "Finance" dropdown. "Pay" moved from a standalone nav pill into that dropdown for the Tethr portal; the client portal's standalone "Pay" link is unchanged, since clients don't see Payroll/Billing. Also fixed two bugs found while smoke-testing the reorg: `pdf-renderer.service.ts` now recovers from a dead cached Chromium instance instead of failing every render forever, and `download.ts`'s anchor-click download no longer silently no-ops on browsers that ignore a detached anchor.

## Employee portal reduced to a phone app (2026-09-09)

The employee surface is now the smallest one in the product, on the principle that an employee should never see the shape of the rest of it.

- **Five destinations, no groups.** `employeeNavigation` is Home / Attendance / Leave / Payslips / Profile, all leaf links. The portal also drops the search field and the hamburger drawer, and its pills match exactly (`end`) — `/me` is a prefix of every other employee route.
- **Bottom bar below 760px.** The same five entries render as a fixed bottom bar (`.bottom-nav`), tinted with the workspace brand color, the open destination carrying a brand-colored pill. Above the breakpoint the header pill row already covers them, so the bar is hidden. `.app-shell-employee .app-content` gets the bar's height back as padding.
- **Home is a greeting + launcher**: check in / check out under the employee's name, a single card of hairline-divided quick links, and the last four of their own requests. The metric strip and the six-card tile grid are gone.
- **Attendance is its own page** (`/me/attendance`): the clock card plus the days already recorded. `useSelfClock` (new, in `modules/attendance/hooks`) holds the clock state so the home hero and that page read one query; the card no longer repeats the page title.
- **Fixed while verifying:** `MY_PROFILE_QUERY` selected the effective-dated `myCurrentSalaryRevision` with no `asOf`, so the whole document failed validation (400) and `/me/profile` rendered every field empty. It now passes today's date.
- **Verified live** against the hosted Supabase DB as `employee@demo.test` at 390x844 and 1280x900, light and dark: check in and check out both round-trip, and the only console error left is the dev server's missing favicon. Typecheck, lint (0 errors), and 132 tests green.

## Attendance exposure + authorization fix (2026-09-04)

**Security.** `modules/attendance` was fully built but had never been wired to authorization: `attendance.resolver.ts` was the only module resolver carrying no `@UseGuards`/`@RequirePermissions`, there is no `APP_GUARD`, and `PERMISSIONS` had no attendance entries at all. Because `PermissionsGuard` returns `true` when a handler has no metadata, every clock and timesheet operation was reachable by any caller, for any `employeeId`.

- Added `attendance:own:read` / `own:write` / `team:read` / `approve`, split the way leave is, and granted them across the six system roles (employees get the `own:*` pair; Tethr HR and client admins get `team:read` + `approve`; Tethr Finance gets `team:read` since payroll needs hours).
- Guarded every attendance operation.
- Added `clockInMe` / `clockOutMe` / `myTimeEntries`, which resolve the employee from the session the way `submitMyLeaveRequest` does — holding `attendance:own:write` can no longer clock a colleague in. The admin `clockIn(employeeId)` now sits behind `attendance:approve`, since clocking someone else in is a correction, not self-service.
- Dropped the `submittedByUserId` / `approvedByUserId` **arguments** from `submitTimesheet` / `approveTimesheet` and took the actor from the session — they were free text, so the audit trail could be attributed to anyone.
- **Regression test:** `core/authz/resolver-guards.spec.ts` walks every `*.resolver.ts` and fails on any operation lacking `@RequirePermissions` outside an explicit public allowlist. Writing it surfaced **seven pre-existing gaps**, listed in `KNOWN_UNGUARDED` so they stay visible: `clients`, and the six `createEmployeeEducation` / `updateEmployeeEducation` / `deleteEmployeeEducation` / `create|update|deleteEmployeeWorkHistory` mutations — same bug class, any authenticated caller can write education and work history for any employee id. A third test makes that list shrink-only. **Still open; close before real users.**
- **Role permission drift** (the F2 follow-up noted below) now has a tool rather than a re-seed: `npm run sync:role-permissions -w @hrms/api` backfills additively — it only adds permissions a definition lists and a row lacks, never removes, so admin customisations survive. The persisted rows happened to be current when checked (57/57 rows matched), but `ensureSystemRole` still returns existing rows untouched, so the underlying drift remains by design.

**Time & attendance UI** (People sub-nav, Tethr + client portals, `/attendance`): employee picker plus date range; **Time entries** tab with a manual "record hours" form for corrections; **Timesheets** tab exposing the open → submit → approve → lock lifecycle, each row offering only the action its status allows. Write actions render only for `tethrAdmin` / `tethrHr` / `clientAdmin`. Clock in/out deliberately lives in the *employee* portal instead — `clockInMe` needs a session linked to an employee, and Tethr staff are not employees.

**Verified live**, not just compiled: logged in as `employee@demo.test` and exercised `clockInMe` → clock event, `clockOutMe` → time entry, `myTimeEntries` → reads back. Unauthenticated calls now return `UNAUTHENTICATED` (401) rather than the old validation failure.

**Constraint worth knowing:** there is no workspace-wide attendance query — `timeEntries` and `timesheets` are both per-employee, which is why the page is scoped by a picker rather than showing a roster grid. A roster view needs a new resolver.

## UX rework (2026-09-04)

Driven by Deel as the reference; the recurring fault was full records crammed into a 500px rail or a single wide auto-fit grid.

- **Onboarding intakes** (employee and workspace) are now full-page stepped flows: titled cards, a vertical step rail with per-step hints, a sticky footer, and a review step with per-section Edit. Shared chrome lives in `web/src/components/onboarding/` so `modules/clients` and `modules/employees` don't import each other.
- **Employee record** moved from thirteen accordions in the preview rail to `/employees/:employeeId` — a sticky identity column plus five tabs (Profile, Job & pay, Documents, Onboarding, Access & exit). `DetailSection` now defaults to open, since the tabs do the narrowing. The rail is a preview: headline facts and an "Open record" button, costing no extra query. `EmployeesListPage` went 3,027 → 443 lines; shared types/formatters extracted to `modules/employees/employee.shared.ts`.
- **Org chart** is its own sub-nav tab (`/employees/org-chart`), sharing the page component so selection and the rail are common.
- **Directory** gained search, multi-select status/worker-type filter chips with count badges, a live row count, and three real empty states. "Onboard employee" became a grouped `ActionMenu` whose shortcuts prefill worker type.
- **Employee self-service**: profile promoted to `/me/profile` with the same identity-column layout. This surfaced **eleven fields that were being sent to `updateMyEmployeeProfile` but had no inputs** — permanent address, both accommodation types, contact channel, and emergency contact. No data was being lost (`profileFrom` hydrated them), but employees could not set them. The `/me` rail is now a pinned clock card plus Request leave / Feedback tabs.
- **Client portfolio** side panel replaced a static role glossary with a live rollup plus a "needs attention" list for clients that have no workspace, each linking into a pre-scoped onboarding flow.
- Added `finalConfirmationDate` to employee onboarding — it was already sent to `createEmployee` but nothing ever set it.

**Gates:** typecheck clean across all packages, **132 tests passing** (api 107 incl. 3 new guard specs, shared 20, ui 5), 0 lint errors, production build clean.

---

> The sections below are the pre-Finance status record (as of 2026-08-24, `finance` branch).

## Finance F2 — billing core (this branch)

- **New `modules/billing`:** `client_billing_configs` (PEPM fee, Net-7 terms, anchor day 20, receiver/sender/bank facts), `billing_groups` with per-group SP/EP-style prefixes, `billing_group_members` (current group + agreed fixed USD rate per employee), and the invoice pipeline: `invoices` + `invoice_lines` with draft → issued → paid lifecycle. Services invoices auto-draft from a finalized payroll run via the idempotent `payroll.finalized` consumer; expenses invoices open manually for pass-through lines.
- **Drafting engine:** advance billing (on/after the anchor day the document covers the following month); catch-up lines for past months never invoiced, pro-rated by working days actually worked (`proratedAmount` — money rounds once); one PEPM fee line per billed person; receiver snapshot frozen at creation; uniqueness by group+type+service month makes re-runs no-ops.
- **Issue & settle:** human numbers `{prefix}{sequence}` assigned only at issue counting issued/paid only (drafts never burn numbers); issuing freezes the document (edits rejected) and emits `invoice.issued` transactionally; mark-paid records date + reference. Client read path (`billing:own:read`) exposes issued/paid only.
- **RBAC:** `billing:read/write` on Tethr Finance, `billing:own:read` on client roles.
- **Web:** `/billing` (terms editor, groups, rates, invoices list, manual expenses-invoice opener) and `/billing/:invoiceId` (line drill-down, add/remove pass-through lines while draft, approve & issue, mark paid).
- **Verified:** typecheck/lint/build green; API tests 96 passing incl. 12 new billing specs; 19-check HTTP smoke passed live (catch-up math 900×8/21=342.86 for the Aug-20 joiner, advance window Aug 20→Sep 20, issue → `SP0001`, immutability rejection, client visibility, settlement, idempotent re-draft).
- **Known follow-ups for F3+:** PDF generation & download, credit notes if ever needed (draft-edit-only per scope), payslip/invoice emailing once SMTP exists, effective-dated group memberships if mid-month team moves become real, and the system-role permission drift issue (persisted tenant role rows don't track shipped definition updates — dev workaround: re-seed; product fix candidate: sync-on-ensure in `ensureSystemRole`).

## Finance F1 — payroll core (this branch)

- **New `modules/payroll`:** monthly runs (`draft → finalized`, one per period), draft lines with working-day pro-rata (mid-month joiners) minus approved unpaid leave via the leave published interface, structure-driven component breakdown snapshots, PK progressive withholding engine from tenant-configured slabs with per-line override, finalization into immutable `payslips`/`payslip_lines` snapshots, per-tenant sequential payslip numbers (`PS-YYYYMM-0001`), bank advice CSV (account facts via the employee-records published interface), and the transactional `payroll.finalized` outbox event carrying the true total.
- **Compensation extension:** `salary_structure_components` (percentOfGross / fixedMonthly) with replace-all validation (percents ≤ 100); breakdown resolved through `getStructureComponentBreakdown`; GraphQL query/mutation for composition.
- **RBAC:** new permissions (`payroll:read/write/finalize`, `payslip:read`, `payslip:own:read`); new `tethrFinance` system role (Tethr portal); employees gain self-service payslip reads.
- **Web:** `/payroll` runs list + draft creation + tax-slab group management; `/payroll/:runId` line grid with component drill-down, tax override editing, regenerate/remove while draft, finalize & lock, bank advice download, issued-payslips table. Nav item gated to Tethr Admin/Finance.
- **Verified:** typecheck/lint/build green across packages; API tests 83 passing incl. calculator + lifecycle specs; 24-check HTTP smoke against Docker Postgres passed (pro-rata = 8 days for an Aug-20 joiner, engine tax = 500 on 60k taxable at the 720k annual band, override round-trip, immutable payslip, bank advice CSV, `payroll.finalized` in outbox).
- **Known follow-ups for F2+:** billing module consuming `payroll.finalized`; payslip emails once SMTP exists; catch-up/arrears suggestion pass; bootstrap gap — `signUp` yields only clientAdmin and `onboardClient` requires an existing tethrAdmin, so brand-new installs have no seed path to Tethr-side roles (dev DB was promoted manually for testing).

## V1 Portal Foundation

- Tenant-scoped role assignments resolve effective permissions, expose backend-sourced assignable workspace roles, and select one of the `tethr`, `client`, or `employee` portals. Signup seeds the first user as a persisted `clientAdmin`; role checks now protect employee, leave, and compensation boundaries.
- Client users have a people overview with live-data-driven onboarding progress, read-only employee directory, hiring-request workflow with persisted update history, compensation workspace, shared leave-request monitoring, and role-aware workspace-user screen. Client admins can add teammates and update API-provided assignable access roles. The selected-employee panel now surfaces client-facing details: headshot/profile, DOB, joining/probation facts, role, current salary, inline effective-dated salary adjustments, assessment history/new assessment action, client-visible document versions/signature status, and bonus history/award action for permitted roles.
- Employees have a dedicated self-service workspace with explicit employment facts for joining date, days since joining, probation end/days left, annual/monthly salary, leave balances/requests with submitted/decision timestamps and Tethr decision notes, a compact month-grouped upcoming-holidays calendar, contact/address/profile-photo updates, news bulletin, and feedback submission. Own-record GraphQL operations derive the employee identity from the authenticated user rather than accepting it from the browser.
- Tethr HR/Admin role definitions and navigation are available. Tethr Admin can list/onboard client workspaces, seed the first client administrator, update workspace-user access levels from the backend policy matrix, and link existing users to employee records when assigning employee access. Tethr users can onboard employee records through a dedicated intake, manage hiring request statuses with client-visible update notes/history, publish announcements, triage employee feedback, triage/approve/reject leave requests with employee/client/Tethr request trail metadata, record assessments, revise effective-dated salary, prepare employee document upload/download access, attach employee documents, add document versions/signature metadata, request manual e-signature envelopes, manage employee onboarding checklists, award bonuses, and maintain Tethr-only private HR records through live GraphQL-backed slices.
- New V1 backend modules/surfaces: account-level client workspace onboarding, `modules/recruitment` for client hiring requests, `modules/engagement` for announcements and employee feedback, `modules/employee-records` for assessment/document links, Tethr-only HR records, and onboarding checklists, document version/signature metadata inside `core/documents`, and compensation bonus awards inside `modules/compensation`.
- Still incomplete for full V1: real object-storage binary transfer and provider-backed e-signature execution behind the document access descriptors, custom roles/data scopes beyond the system-role access levels, and payroll.

## Current Verification Note

- `npm run build:contracts`, `npm run typecheck -w @hrms/api`, `npm run typecheck -w @hrms/web`, API tests (18 suites / 63 tests), and `npm run build` pass after the V1 portal, live client onboarding progress, engagement, records, hiring update-history, backend-sourced access-role assignment, bonus, salary-adjustment, leave-handshake, employee self-service employment facts/holiday calendar, Tethr HR private-record, employee-linked access-level editing, document access/version/signature requests, and HR onboarding checklist slices. The web build currently emits Vite's large-chunk warning at ~554.29 kB minified JS.
- `npm install --include=optional` restored the missing WSL/Linux optional packages for Rollup and ESLint's resolver. `npm run lint` exits successfully with 30 pre-existing import-order warnings; there are no lint errors.

## Foundation Verification (pre-Phase 3 slice)

| Gate              | Command                                                  | Result                                                         |
| ----------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| Type-check        | `npm run typecheck`                                      | ✅ all 5 packages                                              |
| Build             | `npm run build`                                          | ✅ all 5 packages (api/worker via tsc+tsc-alias, web via Vite) |
| Lint              | `npm run lint`                                           | ✅ 0 problems (incl. `core/ ↛ modules/` boundary)              |
| Unit tests        | `npm test`                                               | ✅ 57 passing (shared 20, ui 5, api 32)                        |
| Live boot + smoke | `docker compose up -d` then `npm run start -w @hrms/api` | ✅ boots; 28 tables; Phase 1 + Phase 2 GraphQL flows verified  |

## Phase 3 Compensation Verification

| Gate       | Command                | Result                                                                 |
| ---------- | ---------------------- | ---------------------------------------------------------------------- |
| Type-check | `npm run typecheck`    | ✅ all 5 packages                                                      |
| Unit tests | `TMPDIR=/tmp npm test` | ✅ all workspace tests (`api` includes compensation + schema coverage) |
| Lint       | `npm run lint`         | ✅ exits cleanly; 49 existing import-order warnings remain             |
| Build      | `npm run build`        | ✅ all 5 packages (api/worker via tsc+tsc-alias, web via Vite)         |

Node/npm now work from WSL, and dependencies have been refreshed with Linux
optional native packages required by ESLint's resolver and Rollup.

> **Local environment (current):** the database is a hosted Supabase Postgres —
> connection settings live in `packages/api/.env`, no local Postgres or Docker
> required. `npm run start:dev -w @hrms/api` serves GraphQL at
> http://localhost:3000/graphql. Redis (and `docker compose up -d redis`) is only
> needed to run `packages/worker`. The dated "Verified running locally (Docker)"
> notes below describe earlier runs against a local Docker Postgres/Redis stack.

### Verified running locally (Docker) — 2026-06-20

`docker compose up -d` (Postgres + Redis) → `npm run start -w @hrms/api`. The app
boots, TypeORM `synchronize` creates all **28 tables**, and GraphQL serves at
http://localhost:3000/graphql. Exercised end to end:

- **Core HR:** `createEmployee` then `employees` (tenant-scoped) round-trip.
- **Leave:** create leave type → submit request (costed at 5 working days, Mon–Fri)
  → approve (balance reserved, then spent).
- **Attendance:** clock in/out → time entry → timesheet open → submit → approve → lock.
- Tenant guard fires on Phase 2 queries too: no `x-organization-id` header →
  `TENANT_CONTEXT_MISSING`.
- Every state change wrote its event to the transactional **outbox** in the same
  transaction (`employee.created`, `leave.requested`, `leave.approved`,
  `timesheet.submitted`, `timesheet.locked` — the last two feed Payroll), confirmed
  in Postgres.

The web app at http://localhost:5173 was driven end to end in the browser: **sign
up → dashboard** (live metrics) → **Employees** (live; created an employee through
the form and it appeared) → **sign out** redirects to /login, and hitting a
protected route while signed out redirects to /login. The tenant comes from the
JWT (no dev header). See README "Quick start".

## Implemented (working, tested)

- **`@hrms/shared`** — branded IDs, domain unions, the typed domain-event contract
  (discriminated on `name`), half-open effective-dating math, pure utils.
- **`@hrms/ui`** — design tokens (light + dark) with compile-time parity, exposed
  as the full CSS-variable contract (color, spacing scale, layout, motion, type),
  from design.md. A test locks the contract so the generator can't drop a token
  the component CSS relies on.
- **`@hrms/api` — `core/` platform:** fail-fast config (zod), database + base
  entities (`BaseEntity` / `TenantScopedEntity` / `TemporalEntity`), tenancy
  (AsyncLocalStorage context + auto-scoping repository + provider factory +
  middleware), events (transactional **outbox** + in-process bus + **idempotent
  consumer** + relay), append-only **audit**, auth (User≠Employee, scrypt password
  hashing, `employee.terminated` consumer), authz (permissions + Role + guard),
  and light workflow/notifications/documents service interfaces. The entrypoint
  loads `.env` (dotenv) and enables dev CORS so the SPA can call the API.
- **`@hrms/api` — `modules/` domain spine:** organization (Organization tenant
  root + legal entity/location/department/cost-center), position (job/grade/pay
  band/job-family/position), employee (full GraphQL vertical: entity, published
  `EmployeeDirectory`, service emitting events in-transaction + audit, resolver),
  assignment (effective-dated, non-overlap guard).
- **`@hrms/api` — Phase 2 modules (`modules/`):** **leave** (config-as-data leave
  types, per-period balances with reserve→spend, holiday calendars, working-day
  costing via shared helpers, requests routed through the workflow engine, GraphQL
  vertical; emits `leave.requested`/`approved`/`rejected`/`cancelled`);
  **attendance** (clock-in/out → time entries, timesheet lifecycle
  open→submit→approve→lock, GraphQL vertical; emits `timesheet.submitted`/`locked`).
  `leave.approved` and `timesheet.locked` are the inputs Payroll will consume.
- **`@hrms/api` — auth (core/auth + modules/account):** `@nestjs/jwt` login + `me`
  (core), tenant signup that creates org + admin user (modules/account, composing
  Organization + Auth published interfaces). The TenantContextMiddleware verifies
  the bearer token and sets tenant + principal from it (x-organization-id stays as
  a dev fallback). Stateless JWT — no per-request auth DB hit. Workspace-user
  provisioning and role updates reuse persisted system roles and enforce which
  roles the current admin may assign.
- **`@hrms/api` — Phase 3 compensation started (`modules/compensation`):** pay
  component config, salary structures, effective-dated salary revisions, and
  one-off bonus awards.
  Salary revisions validate employees through the published `EmployeeDirectory`
  interface, close the prior open-ended revision, emit `compensation.revised`,
  and avoid cross-module database foreign keys. This slice has focused service
  tests and schema coverage; type-check, tests, lint, and build now pass.
- **`@hrms/api` — `core/documents`:** document metadata now carries an initial
  `document_versions` history. New versions update the latest storage pointer
  while preserving prior storage keys, size/content facts, signature status,
  signed date, provider, and envelope ID. The document boundary now returns
  provider-shaped upload/download access descriptors and can open a manual
  e-signature request against the latest version; real object-storage byte
  transfer and provider-backed e-signature execution remain follow-up
  infrastructure.
- **`@hrms/api` — V1 portal extensions (`modules/recruitment`,
  `modules/engagement`, `modules/employee-records`):** client hiring requests
  with persisted client-visible update history and Tethr status updates; announcements/news bulletin; employee feedback
  submission and Tethr triage; team leave inbox/approve/reject handoff with
  submitted/decided timestamps and decision notes shared across employee,
  client, and Tethr views;
  assessment history; employee document links with portal visibility plus
  upload/download access descriptors, version/signature metadata reads,
  version-add actions, and manual e-signature requests; Tethr-only HR
  records for role, salary breakdown, bank credentials, hardware information,
  and employee record form data; and Tethr-only onboarding checklists for
  profile, contract, NDA, resume, bank details, hardware, and employee record
  form capture. Each module is
  tenant-scoped, references employees/documents by ID, emits typed domain events,
  and has focused service tests plus schema coverage.
- **`@hrms/api` — Account/client onboarding (`modules/account` +
  `modules/organization`):** Tethr Admin can list client workspaces and onboard a
  new client tenant with its first `clientAdmin` user. Client user creation runs
  inside the newly created tenant context and assigns persisted RBAC data.
- **`@hrms/web`** — React + Vite + Jotai app with **authentication**: login &
  signup pages, token persisted to localStorage (read on init), Apollo auth link
  (bearer), protected routes, sign-out. A live **dashboard** (real metrics), a live
  **Employees** directory (table + master-detail + working create/onboarding form,
  role/salary/profile/probation/inline salary adjustments/document upload and
  download access, document versions/signature status/e-sign
  requests/assessments/bonus detail surface plus Tethr-only private HR record
  and onboarding checklist editors),
  a live-data-driven client onboarding walkthrough, a workspace-user access editor with employee
  record linking for employee access, a live
  **Compensation** workspace (pay components, salary structures, salary
  revision history, and create/revise forms), **Client portfolio**, **Hiring
  requests** with client-visible update history, employee self-service holiday calendar, **Leave triage** with
  shared request-trail metadata, **Announcements**, **Employee feedback**, and
  role-aware portal home screens wired to the GraphQL API, a shell
  showing the signed-in user, theme provider (light/dark) — all on design tokens.
- **`@hrms/worker`** — queue abstraction (BullMQ) + example processor + runner.

## Scaffolded (shape in place, to be fleshed out)

- Auth: refresh tokens, MFA, password policy, signup email verification, and
  populating the JWT with the user's permissions (login/signup/me + the JWT
  middleware guard are done).
- Authz: populating the request principal and registering `PermissionsGuard`
  (globally or per-resolver); data-scope enforcement in services.
- Workflow: approval chains/steps/escalation behind `WorkflowService`.
- Notifications: real per-channel delivery + templating behind `NotificationService`.
- Documents: real object-storage byte transfer and provider-backed e-signature execution behind `DocumentService`.
- Web: pages for the other live modules (Time off, Attendance, Organization,
  Positions) — currently disabled nav placeholders; and GraphQL codegen → typed
  hooks (queries are hand-written `gql` for now). The Employees detail panel will
  show department/manager/location once those fields are exposed over GraphQL.
- DB: generate the initial migration (see `packages/api/src/core/database/migrations/README.md`).

## Not yet started / next (roadmap)

Phase 3 Payroll remains next after the Compensation slice is hardened in browser
smoke testing. Payroll will consume `leave.approved`, `timesheet.locked`, and
`compensation.revised`, then lifecycle/talent and services/insight follow
(plan.md §4, §8). The spine, platform, and time-off/attendance inputs are in
place for them.

## Key decisions & deviations

- **npm workspaces over Nx** (architecture.md §15 deviation) — zero-install,
  fully verifiable. TS project-reference-free; packages build in explicit order.
- **Within-package imports are relative; `@/`,`~/` aliases** are wired via
  tsc-alias (build) + jest mapper. Cross-package uses real package names.
- **`@typescript-eslint/consistent-type-imports` is OFF** — it conflicts with
  NestJS constructor injection (its autofix turns DI class imports into
  `import type`, erasing the `emitDecoratorMetadata` reference and breaking DI).
- **Half-open date ranges** `[validFrom, validTo)` so adjacent records neither
  overlap nor gap.
- **GraphQL schema generated in memory** at boot (no filesystem dependency).
- **Vite consumes internal packages from source** (avoids CJS named-export interop).

## Known follow-ups / risks

- ⚠️ **Apollo Server v4 reached end-of-life 2026-01-26.** It works, but plan an
  upgrade to Apollo Server v5 + `@nestjs/apollo`/`@nestjs/graphql` v13 + NestJS v11.
- Generate the initial DB migration before any non-dev deploy.
- Wire the authenticated principal into `TenantContext` (the middleware currently
  reads an `x-organization-id` header as a dev shim).
