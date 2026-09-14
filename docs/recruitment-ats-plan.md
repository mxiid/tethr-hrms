# End-to-end hiring cycle: plan

## Context

Today the flow lives outside the product: client briefs us on Slack (title, job description, salary, hiring manager, reporting line) → we post to LinkedIn → candidates fill a website form → Notion DB → an external Gemini automation parses and ranks CVs → we present the top 5 to the client → they interview, and if none land we send the next 5.

The goal is to run that whole cycle inside the HRMS, with a generic form builder underneath the application form, and candidates landing directly in our own DB.

**Decisions taken:** intake moves to the client portal (Slack becomes a notifier, not the system of record) · generic form builder with the application form as its first consumer · CVs go to Supabase Storage · **AI parsing is a stubbed seam for now** — the pipeline must work end to end with manual scoring, and the AI step slots into the same place later.

## What exists today

`modules/recruitment` is a single-aggregate intake tracker: one `HiringRequest` row, an append-only `HiringRequestUpdate` trail, one query and two mutations. There is **no candidate, application, interview, offer, CV or job-posting concept anywhere in the repo**, and no link from a hiring request to a position or employee. This is greenfield.

Three things about the current `HiringRequest` matter:

- It does **not capture what the client actually tells us**: there is no job description field (only a generic `clientNote`), no salary, no hiring manager, no reporting line.
- Its seven-state status union (`submitted → inReview → sourcing → interviewing → offer → filled → cancelled`) has **no state machine** — `recruitment.service.ts:133` assigns any status to any other, including `filled → submitted`. The union is duplicated in four unsynchronized places (shared enum, the DTO `@IsIn`, the page's label/color maps, the dashboard widget).
- `listHiringRequests` returns **every request to both portals**, including `tethrNote`. Candidate data will need real per-portal partitioning, which has no precedent here.

## Tenancy: where the data lives, and where the boundary is crossed

Tethr staff need one board across every client. That crosses the tenancy guarantee, so it is designed here explicitly rather than reached for ad hoc. Useful starting point: `Organization.kind` is already `'tethr' | 'client'`, and Tethr's own workspace is the one with `clientId: null` — so there is a first-class vendor/client distinction to hang this on. There is no precedent to copy: the only two `unsafeRepository` uses in the codebase are narrow deletes by id.

### Where each entity lives

| Workspace | Entities |
|---|---|
| **Client's** | `HiringRequest` (they raise it, in their own portal) |
| **Tethr's** | `JobPosting`, `Candidate`, `Application`, `CandidateDocument`, `CvParse`, `Shortlist`, `ShortlistEntry`, `InterviewRound`, `Interview`, `InterviewFeedback`, `Offer` |

**The candidate pool lives in Tethr's workspace, and that is the load-bearing decision.** A candidate rejected by Client A can then be presented to Client B — which is the entire point of an agency pool, and is impossible if the person's row is trapped inside a client's tenant. It also gives cross-vacancy history and a single point for GDPR deletion, and it means day-to-day recruiting work is ordinary tenant-scoped operation needing no bypass at all.

Cross-tenant references are by id only, extending non-negotiable #2 across the tenant boundary: `JobPosting` carries `sourceHiringRequestId` plus `sourceOrganizationId`, never a foreign key.

### The two crossings

Both are **read-only** and both go through one named service — never ambient `unsafeRepository` access scattered through the modules.

**1. Tethr → client workspaces: the cross-client board.** Reads `HiringRequest` rows across every client workspace. Guarded by three conditions, all server-side: the caller's organization is `kind === 'tethr'`, the caller holds a new `platform:read-all` permission, and the target organizations are `kind === 'client'`.

**2. Client → Tethr's workspace: the presented shortlist.** A client sees the candidates put in front of them. This is deliberately not a general read of Tethr's workspace — it is a narrow projection: only `ShortlistEntry` rows whose shortlist is `presented`, and whose posting traces back to a hiring request owned by *that* client's organization. The filter is applied server-side from the caller's own organization; a client-supplied id is never trusted.

### Why the guard keys on `kind`, not just the permission

Roles and their permission arrays are **tenant data** — rows in each tenant's own database that `system-roles.ts` only seeds. `Organization.kind` is not tenant-editable. Keying the boundary on `kind` means that even a tenant that somehow acquires the permission string still cannot cross it. The permission alone is not a sufficient guard; both must hold.

### Rules that keep this small

- **Writes stay tenant-scoped.** Acting on a client's hiring request means switching into that workspace. Since the pipeline itself lives in Tethr's workspace, this costs almost nothing day to day, and the data layer keeps its guarantee against a cross-tenant write bug.
- **Never widen the existing query.** Add a separate platform-scoped `clientHiringRequests` rather than teaching `hiringRequests` to return more, so the tenant-scoped one cannot silently start leaking.
- **An explicit entity allowlist**, not "any tenant-scoped table".
- **Audit both directions** — who read across which organizations, every time.
- **0.3 must land first.** An unverified `x-organization-id` header granting tenant context has no business existing alongside a deliberate cross-tenant capability.

## Phase 0 — Platform prerequisites

These are blockers, not nice-to-haves. Each is absent today.

**0.1 Object storage (Supabase Storage).** There is no object storage configured anywhere — `config.schema.ts` has zero storage vars. `core/documents` looks complete but its `prepareUpload`/`prepareDownload` mint `hrms-document://` URLs, which is **not a real protocol**; no bytes ever move. The web client takes the returned `storageKey` and puts it in an editable text field the user can type anything into. Keep the `Document`/`DocumentVersion` metadata schema and `buildStorageKey`, replace the fake presigner with real signed URLs. The existing base64 data-URL pattern (employee photos, invoice logo) will not work for CVs: a 5 MB PDF is ~6.8 MB base64, past both the `600_000` char caps and the 2 MB body limit.

**0.2 A public surface.** There are no REST controllers in the API and no `@Public()` decorator; auth is opt-in per resolver. The precedent to follow is the seven existing unguarded GraphQL operations (`login`, `signUp`, `workspaceNameIsAvailable`). Public form fetch and submit are new unguarded resolvers. File upload needs either the first REST controller or a signed direct-to-storage upload URL — prefer the latter, since there is no multipart handling in the API at all.

**0.3 Signed link tokens, and closing the tenant hole.** An anonymous submission has to resolve a tenant. `TenantContextMiddleware` currently accepts an **unverified `x-organization-id` header** and grants full tenant context from it — its own comment calls it a dev shim. Do not build on it; close it. Instead mint a signed form-link token modeled on the existing `WorkspaceSelectionClaims` pattern. **Critical detail:** the token must not carry `sub` + `org` at the top level, or `readToken` will promote it to a full session.

**0.4 Job producer and outbox relay.** `packages/worker` has a typed `JOBS`/`JobPayloads` contract and a BullMQ runner, but the API does not depend on `bullmq` and **no `enqueue()` exists** — a job cannot currently be created. Separately, `OutboxRelayService.relayPendingBatch()` **has zero call sites**, so every domain event ever published is still sitting `pending` and no consumer has ever fired. Both need wiring before the ATS can rely on async work or events.

**0.5 The platform-scope service.** One service in `core/tenancy` implementing both crossings described above: `assertPlatformRead()` (organization `kind` plus permission), `listClientOrganizationIds()`, and a read helper that runs queries with an explicit `organizationId IN (...)` instead of the AsyncLocalStorage-injected single tenant. Add `platform:read-all` to `PERMISSIONS`, granted to `tethrAdmin` and `tethrHr`, never to any client role. Every call writes an audit record.

**0.6 Email and Slack.** `NotificationService.send()` is a single `console.log`, no provider is configured, and `SendNotificationInput` only accepts a `recipientUserId` — there is no shape for emailing an external address like a candidate. Candidate acknowledgements and "your shortlist is ready" alerts need a real channel. Slack intake notification is an incoming-webhook URL in config.

## Phase 1 — Hiring request becomes a real requisition

Extend the existing aggregate rather than adding a parallel one.

- Add the fields the client actually gives us: `jobDescription` (text), `salaryMin` / `salaryMax` / `salaryCurrency`, `hiringManagerEmployeeId`, `reportsToEmployeeId` (by id only — no cross-module foreign keys).
- **Introduce a state machine** in the service and collapse the status set. Once real pipeline entities exist, `sourcing` / `interviewing` / `offer` become derived from applications rather than hand-set, so the request's own lifecycle shrinks to roughly `draft → open → onHold → filled → cancelled`. Fix the four-way duplication while touching it.
- Reconcile with `Position`, which already carries its own `headcount` and `open | filled | closed` status that silently shadow the request's.
- Slack notification on `hiringRequest.submitted` (needs 0.4's relay to actually fire).

## Phase 2 — Generic form builder

- `FormDefinition` (name, slug, status, which entity it feeds), `FormField` (type, label, required, options, order, `mapsTo`), `FormSubmission` (answers as jsonb plus file references).
- Public render and submit via the 0.3 signed link, with per-form rate limiting.
- The application form is the first consumer. `mapsTo` projects answers onto the core Candidate and Application columns, which means **the exact columns you use in Notion become configuration, not schema** — that is what makes "I'll share the headers later" a non-blocker.

## Phase 3 — ATS core

Frappe HR is the benchmark for the back half, but its front half has a fundamental gap: **it has no Candidate entity.** A Job Applicant is per-opening and named by email address with `-1` / `-2` suffixes, so one person applying to three roles is three disconnected copies of their name, phone and CV. It also has no client dimension at all — it models in-house corporate hiring, not agency placement. So:

```
Candidate (1) ——< Application >—— (1) JobPosting
```

- **`JobPosting`** — created from a hiring request; public slug; separate publish flags (`isPublished`, `publishSalaryRange`) so "is it live" stays independent of "what do we disclose"; `closesOn` with a scheduled auto-close.
- **`Candidate`** — a person, unique per org by email. Owns identity, CV versions, parsed profile and consent state. This is the most important thing Frappe lacks: it gives cross-vacancy history ("we spoke to her 8 months ago") and one place for GDPR deletion.
- **`Application`** — the join, and where the pipeline lives. Keep **stage, outcome and hold as separate fields** rather than Frappe's single flat enum, which conflates all three.
- **`CandidateDocument`** — the CV file in object storage, versioned.
- **`CvParse` (the AI seam, stubbed)** — `status: pending | parsed | failed`, `extractedText`, `structured` jsonb, `score`, `provider`, `parsedAt`. A job is enqueued on upload; **the processor is a stub that marks the record awaiting-AI**. Scores can be entered manually, so ranking and shortlisting work fully today and the real parser drops into this one processor later.

These all live in Tethr's workspace — see the tenancy section. Clients see only the candidates presented to them, via the narrow projection described there, which the current "everyone in the org sees everything" query shape does not support.

## Field map (from the existing Notion databases)

### Job Openings

| Notion column | Destination | Note |
|---|---|---|
| Position | `HiringRequest.positionTitle` | exists |
| Client | **derived**, not stored | resolved `organizationId → Organization.clientId → Client.name` and returned as a field on the cross-client board |
| Status | `HiringRequest.status` | needs the Phase 1 state machine |
| Employment Type | `HiringRequest.employmentType` | exists |
| Posted Date | `JobPosting.postedAt` | deliberately distinct from the request's `createdAt` — briefed and posted are different days |
| Priority | **new** `HiringRequest.priority` | `urgent \| high \| normal \| low` |
| Target Fill Date | **new** `HiringRequest.targetFillDate` | the date we want the hire *closed by* — a deadline on us, not on the candidate. Distinct from the existing `preferredStartDate`, which is when the person would actually begin; keep both, since they drive different things (see below) |
| Description | `HiringRequest.jobDescription` | Phase 1 |
| Applicant Count | **derived**, not stored | a count over applications |

### Application form

Split across three places. The rule: **Candidate holds the person, Application snapshots what they told us at the time.** A candidate who re-applies a year later has a different current title and salary, and overwriting the person's row would silently rewrite history — this is the repo's own non-negotiable #3 ("reference the employee; snapshot for history") applied to candidates.

The two dates each have their own downstream consumer, which is why both earn their place: `targetFillDate` drives urgency alongside `Priority`, and is what a **time-to-fill** report measures against — Frappe stores that as a computed duration stamped at the moment of fill rather than deriving it on read, which is worth copying since it makes the KPI query trivial and lets you report on-time versus late fills. `preferredStartDate` carries forward into the offer's start date in Phase 6.

**Candidate** (the person, latest known): Full Name · Email (unique per org) · Phone · LinkedIn · Portfolio

Keep Full Name as one field. Splitting into first/last loses information at intake and only matters at hire, where the `createEmployee` path already needs `firstName`/`lastName`.

**Application** (per-role, snapshotted at submission): position → `jobPostingId` · Stage · Expected Salary + Salary Currency · Current Salary · Current Title · Years of Experience · Location · Tech, Stack and Skills · "Tell us why you're a good fit" → `coverNote` · Rating → `manualRating` · Notes

`Submitted At` becomes `Application.createdAt` rather than a separate column.

Keep `manualRating` distinct from the AI score that lands later — one is a human judgment, the other a model output, and collapsing them makes it impossible to tell which drove a shortlist decision.

**CvParse / CandidateDocument**: Resume → the file in object storage · Parsed CV → `CvParse.extractedText`

### Dropped as redundant

- **Job Description** (on the candidate row) — a property of the opening, denormalized onto every applicant. Comes through the relation.
- **CV Processed** (checkbox) — superseded by `CvParse.status`, since a boolean cannot express "failed".
- **Submission ID** — a Notion idempotency workaround. `FormSubmission` has a real primary key.
- **Rejection Email Sent** (checkbox) — delivery state hand-tracked in the database. Belongs in the communications log once the email channel exists in 0.5, and derives from there.
- **Applicant Count** and **Client** on Job Openings — both derived, per the table above.

## Phase 4 — Shortlists in batches (the agency piece)

This is what Frappe cannot express at all, and it is the core of the flow.

- **`Shortlist`** — `jobPostingId`, `roundNumber`, `status: draft | presented | feedbackReceived | closed`, `presentedAt`.
- **`ShortlistEntry`** — `applicationId`, `rank`, `clientDecision: pending | interested | rejected`, `clientNote`.

Flow: we rank candidates internally → select the top 5 into a round-1 shortlist → present → the client portal shows **only those five** → the client marks each interested or rejected → if the round closes with nothing, round 2 is the next 5. The round number falls out of the model rather than being a counter somewhere.

Model the client's verdict directly on `ShortlistEntry` rather than forcing it through `WorkflowService`: the core approvals service records only who *requested*, has no approver routing, no notification and no query surface, and a flat pending/approved/rejected is poorer than the per-candidate feedback needed here.

The **CV comparison view** is a natural read over one shortlist: its entries side by side, parsed fields aligned, scores and client decisions in one grid.

## Phase 5 — Interviews and scorecards

Copy Frappe's structure here almost wholesale — it is the one part of their model that is clearly right.

- **`InterviewRound`** (their "Interview Type") — the template: name, order index, expected skill set, expected average rating.
- **`Interview`** — application + round + slot + panel + rolled-up average + outcome. Created by Tethr, never self-scheduled by the client, so there is no availability picker, no calendar-slot negotiation and no client-side invite flow to build. The candidate gets the invite by email (0.6); the client is coordinated with outside the system.
- **`InterviewPanelMember`** — and this is where we must diverge from Frappe. Their interviewer is a hard link to a `User`, because everyone interviewing is an employee of the hiring company. Here the people interviewing are usually **the client's staff, who have no HRMS login at all**. So a panel member is either an internal user (by id) or an external person (name, optional email), and the model has to allow both.
- **`InterviewFeedback`** — **one record per interviewer**, not rows in a shared table. That separation is what gives independent submit timing, "who has not filed yet" chasing, and an audit trail on revision. Because we record outcomes on the client's behalf, keep **whose opinion it is** (`panelMemberId`) separate from **who typed it in** (`recordedByUserId`). Collapsing those two loses the attribution that makes the scorecard worth anything.
- **`SkillRating`** — skill (seeded read-only from the round template) plus score.

Rollups: per-feedback average → per-interview average across feedback → per-skill average across interviewers (that last one powers the comparison view). Two Frappe bugs not to inherit: they divide by the count of *all* skill rows rather than *rated* ones, so an unrated skill silently deflates the score; and they recompute on submit but must also recompute on cancel.

Guards worth copying: feedback must reference a member of that interview's panel, one feedback per panel member (withdraw to refile), and no feedback before the scheduled date. **Drop Frappe's "session user must be the interviewer" check** — it assumes interviewers log in and file their own feedback, which is exactly what does not happen here. Replace it with a permission check on the Tethr user doing the recording, plus the `recordedByUserId` stamp for the audit trail.

The client's involvement in this phase is read-only: they see that interviews happened and what the outcomes were, through the same narrow projection described in the tenancy section. Their actual decision point stays the shortlist entry in Phase 4.

## Phase 6 — Offer and hire

- **`Offer`** — hangs off the application. **Type the core terms** (base salary, start date, probation, notice period) rather than Frappe's generic key/value `offer_term` bag, which is unqueryable and uncomparable. Keep a small extras bag for genuine one-offs.
- On acceptance, create the employee through the existing `createEmployee` path, carrying the candidate's details across, and link back so the hire traces to the application, the shortlist round and the original request. Then close the position and the hiring request.
- Skip Frappe's duplicate-offer check scoped globally by email — it blocks legitimate parallel offers and would be actively wrong for agency placement.

## UI

A `Candidates` tab under hiring, plus per-request tabs: Overview / Candidates / Shortlists / Interviews. The shared components built in the last pass carry most of this — `DataTable`, `ViewBar` (filter, sort, columns), `SidePanel`, and `useInlineCreate` for adding a candidate by hand. The CV comparison view is the one genuinely new surface.

## Redundancies to retire

- The Notion DB, once the application form ships.
- `HiringRequest`'s pipeline statuses, which become derived from applications rather than hand-set.
- The fake `hrms-document://` presigner and the base64 data-URL upload pattern (employee photos and the invoice logo should migrate to real storage too).
- The editable `storageKey` text field in the employee documents UI.

## Open questions

- **Target Fill Date vs start date.** See the field map — decide which one that column means.
- **LinkedIn.** Posting stays manual for now — is automated posting in scope later, or does the job board page suffice?

## Implementation plan (execution)

**Decisions taken (2026-09-14):** checkpointed execution — M1–M3 first, then re-plan the domain phases · cross-tenant writes go through an audited `PlatformScopeService.switchTo` (kind + permission guarded) · email via Resend HTTP with a logger fallback · outbox relay runs as an in-API interval (consumers live in the in-process bus) · request lifecycle `submitted → open → onHold → filled → cancelled` · Supabase Storage is not provisioned yet, so storage ships behind a driver interface (`supabase` for production, dev-only `local`).

**Corrections to this doc found while verifying against the code:** `Organization.kind = 'tethr'` is never written today (signup and `onboardClient` both create `client` orgs; the demo Tethr workspace is only promoted at the user level) — M1 adds a seed change, a backfill script and a partial unique index · the `x-organization-id` shim in `TenantContextMiddleware` runs in every environment, not just dev · `platform:read-all` does not exist and `ensureSystemRole` never updates existing tenant role rows, so `npm run sync:role-permissions` is part of M1 · `workspaceNameIsAvailable` is actually `legalNameIsAlreadyUsed` · `core/` cannot import module entities (two-bucket rule), so the entity allowlist for the board lives in `modules/recruitment` while the audited tenant switch lives in core · Position has no close/status API and `createEmployee` cannot carry source linkage — both extend in their phases.

### M1 — Tenant-safe public surface + platform scope (0.3, 0.5, kind bootstrap)

- Shared `FormId`; `FormLinkClaims { type:'form-link', formId, organizationId }` (no `sub`/`org`, so `readToken` can never promote one to a session); `FormTokenService` (mint/verify, `FORM_LINK_TTL_DAYS`).
- `TenantContextMiddleware`: bearer-only — the `x-organization-id` fallback is deleted.
- `PlatformScopeService` (core/tenancy): `assertOperator(permission)` (caller org `kind === 'tethr'` **and** permission), `resolveTethrOrganizationId()`, `listClientOrganizationIds()`, `switchTo({ organizationId, purpose, ... }, work)` — audits before switching, then runs work with the tenant ALS pointed at the target while keeping the caller's principal.
- `platform:read-all` permission; explicit `tethrHr` grant; run `sync:role-permissions`.
- Kind bootstrap: partial unique index on `kind = 'tethr'`, `OrganizationService.markAsTethr`, seed-demo marks its Tethr workspace, `npm run mark:tethr-workspace -w @hrms/api -- --email <tethr admin>` backfills existing DBs.
- Verify: form-token spec (round trip, wrong type rejected, middleware never promotes it), platform-scope spec (non-tethr org refused, missing permission refused, audit + ALS switch), gates.

### M2 — Real storage behind a driver interface (0.1)

- Config `STORAGE_DRIVER` (`local | supabase`, production refuses `local`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `STORAGE_SIGNED_URL_TTL_SECONDS`.
- `core/documents/storage.service.ts` + adapters: Supabase signed upload/download via REST `fetch` (absolute URLs, error mapping) and a dev-only Local adapter backed by disk plus an HMAC-signed dev route (the API's first REST controller, registered only for the local driver). `DocumentService` rewires to it; `buildStorageKey` and the metadata schema stay.
- Web: employee documents lose the editable storage-key fields — PUT bytes to the signed URL, attach the server-issued key, download via signed URL.
- Verify: adapter specs (Supabase fetch mocked), browser round trip with a 5 MB PDF on the local driver; rerun against Supabase once credentials exist.

### M3 — Jobs, outbox relay, channels (0.4, 0.6)

- `JOBS`/`QUEUES`/`JobPayloads` move to `@hrms/shared`; `parse-cv` added (stub, consumed in the ATS phase); worker listens on the default queue too and imports the shared contract.
- API gains `bullmq` + `core/queue/message-queue.service.ts` (typed `add`, lazy connect, close on shutdown).
- `core/events/outbox-relay.runner.ts`: `OnModuleInit` interval (`OUTBOX_RELAY_INTERVAL_MS`, default 5000, `0` disables) calling `relayPendingBatch()` with an overlap guard.
- Notifications: `SendNotificationInput` gains an external-email shape; `ResendEmailTransport` (HTTP, `RESEND_API_KEY`, `EMAIL_FROM`) with logger fallback; `SlackTransport` (`SLACK_WEBHOOK_URL`); small template registry.
- First consumer: `hiringRequest.submitted` → Slack notice (idempotent, tenant re-established from the event).
- Verify: relay spec (dispatch, retry count, idempotency), job contract typechecks in both packages, end-to-end demo (pending → processed → notice; API-enqueued job processed by the worker; storage round trip). Checkpoint, then re-plan M4–M10.

### M4–M10 — domain phases

**Status: M1–M9 landed 2026-09-14, plus the M10 tidy-up** (checkpoint records in [STATUS.md](STATUS.md)); the full cycle runs in-product — client brief → published posting + signed apply link → anonymous application with CV (acknowledged by email) → candidate/application projection → ranked shortlist rounds with client verdicts → interviews with scorecards and rollups → typed offer → acceptance hires the employee into the client's workspace and closes the request, posting and position. **Remaining, deliberately deferred:** Supabase Storage verification (needs credentials; the local driver implements the same interface), the real CV parser behind `parse-cv`, a postings list/auto-close surface, the employee-photo/invoice-logo storage migration, a form-builder UI over the existing operator API, and targeting a client workspace when Tethr raises a request on their behalf.

M4 Requisition (Phase 1 of this doc: fields, transition map, portal partitioning, Position reconciliation, cross-client board) · M5 Form builder (Phase 2) · M6 ATS core (Phase 3) · M7 Shortlists (Phase 4) · M8 Interviews (Phase 5) · M9 Offer & hire (Phase 6) · M10 cleanup (photo/logo migration, Notion backfill, doc updates). Each milestone: shared contracts → entity/service → resolver (+ guards) → schema and resolver-guards specs → web → browser verification → gates.
