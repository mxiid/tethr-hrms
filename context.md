# Project Context — read me first

> **Audience: Claude (or any AI agent) working in this repository.**
> This file is the orientation. Read it before doing anything else, then read the three reference docs it points to. It exists because you start each session with no memory of how this project came to be — this is that memory.

> **Tip to make this automatic:** reference this file from a `CLAUDE.md` (or rename it `CLAUDE.md`) so it loads into context at the start of every session without being asked.

---

## What we're building

A **modular HRMS** (Human Resource Management System) — eventually a full HCM suite. It is built as a **modular monolith**: one deployable system, internally partitioned into strict modules, where any module can later be extracted into its own service _without a rewrite_.

The overriding requirement, stated by the user and repeated everywhere: **the structure must stay coherent as it scales — it must not crumble.** When you face a design choice, the tiebreaker is almost always "which option keeps modules decoupled and independently extractable."

---

## The document set

Four files travel together. Each answers a different question. Read them in this order:

| #   | File                               | Answers                                                                                 | Read when                                               |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | **context.md** (this)              | _What are we doing and how does the user want me to work?_                              | First, always                                           |
| 2   | [architecture.md](architecture.md) | _How is any product of this kind structured?_ (general, reusable playbook)              | Before writing any code or making a structural decision |
| 3   | [plan.md](plan.md)                 | _How does the HRMS specifically map onto that playbook?_ (modules, data spine, roadmap) | Before building any HRMS feature                        |
| 4   | [design.md](design.md)             | _What does it look and feel like?_ (design tokens, components, styling)                 | Before building any UI                                  |

**The relationship:** `architecture.md` is the abstract, product-agnostic playbook. `plan.md` is that playbook instantiated for this HRMS. `design.md` is the visual language. This `context.md` is the glue and the working agreement.

> Note: `architecture.md` and `design.md` were abstracted from the Twenty CRM codebase but are written to be product-agnostic. Treat them as **our** standards now — do not reference Twenty in new work.

---

## The working agreement — non-negotiables

These are load-bearing. Do not violate them without explicitly flagging the trade-off and getting a decision. Full rationale in [plan.md §1](plan.md) and [§5](plan.md).

1. **Each module owns its data.** No other module reads its tables directly — no cross-module JOINs. Access goes through a published service interface or a domain event.
2. **No cross-module database foreign keys.** Modules reference each other by ID only. A DB-level FK welds two modules together and blocks extraction.
3. **Reference the employee; snapshot for history.** Live data is referenced by `employeeId`. Anything legal/financial/audited (payslip, closed review, signed offer) snapshots the values it depended on so history can't be rewritten.
4. **Effective-dated from day one.** Backbone facts (assignment, salary, manager, department) carry `validFrom`/`validTo`. Queries ask "as of date X".
5. **Configuration is data, not code.** Leave policies, approval chains, pay components, grades — tenant-scoped data driving generic engines, never `if` branches.
6. **`User` ≠ `Employee`.** Login identity and HR record are separate, optionally linked. ([plan.md §3.1](plan.md))
7. **Modules communicate through three channels only:** published interfaces (sync reads), domain events (async side effects), immutable snapshots (history). Nothing else. ([plan.md §5](plan.md))

---

## The working agreement — conventions

From [architecture.md §6–§8](architecture.md). Apply without being reminded:

- **Two-bucket backend:** `core/` = platform (auth, tenancy, RBAC, workflow, notifications, documents, audit). `modules/` = HR domain. `modules/` depends on `core/`, never the reverse.
- **Feature modules are self-contained:** each owns its UI, state, service, tables, and tests, in a predictable folder shape ([architecture.md §2.2](architecture.md), [§5.1](architecture.md)).
- **Strict TypeScript, no `any`.** Named exports only. Functional components only. String-literal unions over enums (except GraphQL). Types over interfaces.
- **No abbreviations** in names (`employee` not `emp`, `fieldMetadata` not `fm`).
- **Code-first contracts:** GraphQL schema / ORM types are generated from typed code, never hand-authored. Generated code lives in `src/generated/`.
- **Events for side effects, never deep synchronous call chains.** Use an outbox pattern + idempotent consumers.
- **Tenancy scoped at the data layer** so code cannot forget to scope.

## The working agreement — design

From [design.md](design.md). For any UI:

- **Tokens, never hard-coded values.** Pull from `ui/theme/` — colors, spacing, radii, typography, motion.
- Spacing on a **4px grid**; default radius 4px (buttons) / 8px (cards, modals).
- Typography: **Inter** (weights 400/500/600), `DM Mono` for code.
- Accent color **indigo**; semantic naming (`danger`/`success`/`warning`).
- Icons: **Tabler**, stroke scales with size.
- **Light/dark parity** is built in — every token has both. Don't ship a light-only component.
- Styling via zero-runtime CSS-in-JS; one component per file; co-locate stories and tests.

---

## How the user likes to work

Observed preferences — honor them by default:

- **Scope collaboratively, then build.** The user prefers to review a proposed list (modules, features, options) and tell you what's missing _before_ you commit to building. When scoping something open-ended, present a clear, grouped list (essential vs. extended) and invite correction — don't silently pick.
- **Recommend, don't survey.** Once scope is set, give a clear recommendation with a short rationale, not an exhaustive menu of every option. Make the call and explain it.
- **Ground everything; never hallucinate structure.** Verify file/folder/symbol names before relying on them. The user values work derived from what's actually there over plausible guesses.
- **Robustness and reusability over cleverness.** Favor the boring, decoupled, extractable design. The user explicitly asked for abstractions reusable "anywhere."
- **Structure the output.** Tables, phased roadmaps, clear groupings, and short rationale land well. Mermaid diagrams where a relationship is easier shown than told.
- **Respect the deviation rule.** [architecture.md §15](architecture.md) — the playbook is a starting shape, not a cage. Deviate when it makes things _more_ predictable for the context, but say so.

---

## When you start work here

1. **Read** this file, then [architecture.md](architecture.md), [plan.md](plan.md), [design.md](design.md).
2. **Confirm the target** — which module and which roadmap phase ([plan.md §8](plan.md)) are we working on? If unclear, ask before building.
3. **Place new code** per the structure in [architecture.md §7](architecture.md)/[plan.md §7](plan.md) — right bucket (`core/` vs `modules/`), right folder shape.
4. **Check the non-negotiables** above before designing data access or inter-module interaction. If a task seems to require breaking one, stop and flag it.
5. **Use design tokens** for any UI.
6. **Definition of done:** type-checks clean, lint passes, tests written (behavior not implementation, ~70/20/10 unit/integration/e2e), conventions followed, no cross-module data leaks introduced.

---

## Current state & decisions

- **Stack (now scaffolded):** TypeScript end-to-end · NestJS + TypeORM + PostgreSQL (hosted on Supabase) backend · code-first GraphQL · React + Vite + atom-based state (Jotai-style) frontend · **npm-workspaces** monorepo (a documented deviation from Nx, for zero-install verifiability — see [docs/STATUS.md](docs/STATUS.md)). Redis is only needed to run `packages/worker`.
- **Module catalog is drafted** ([plan.md §4](plan.md)) with an essential (✅) vs. extended (➕) split. The user was invited to review it — check whether they've since added/removed/repromoted modules and keep `plan.md` as the source of truth.
- **Roadmap is dependency-ordered** ([plan.md §8](plan.md)): Phase 0 Platform → 1 Core HR spine → 2 Time off & attendance → 3 Pay → 4 Lifecycle & talent → 5 Services & insight. Build in this order unless told otherwise.
- **Phases 0–2 plus authentication are built, Phase 3 Compensation is underway, and the V1 portal foundation has live client/employee/Tethr slices.** Signed-in users route into Tethr, client, or employee workspaces; Tethr Admin client portfolio/onboarding, live-data-driven client onboarding walkthrough, client user management with backend-sourced access-role editing and employee record linking, Tethr HR/Admin employee onboarding intake, read-only client employee directory, employee self-service with explicit joining/probation/salary facts and month-grouped holiday calendar, hiring requests with persisted client-visible update history, leave triage with shared employee/client/Tethr request-trail metadata, announcements/news, employee feedback, assessment/document version metadata, document upload/download access descriptors, manual e-signature requests, inline salary adjustments from employee detail, Tethr-only private HR records, Tethr-only onboarding checklists, bonus awards, and richer client-facing employee details have GraphQL-backed UI. Type-checks, API tests, lint, and production build pass, with import-order warnings remaining. The backend runs against a hosted Supabase Postgres — no local database or Docker needed (Redis is only required to run `packages/worker`). Full state and follow-ups are in [docs/STATUS.md](docs/STATUS.md).

---

## Open questions (resolve with the user before they bite)

- **Product name** — the HRMS is unnamed; placeholder is "the HRMS".
- **Payroll: build vs. buy** — per-country statutory/tax logic is deep. Build in-house per country, or integrate a provider via the Integration Hub? ([plan.md §10](plan.md))
- **Shift/roster scheduling priority** — essential or extended? Depends on whether the target workforce is deskless/frontline.
- **Stack confirmation** — the foundation proceeded with the working-default stack (npm-workspaces deviation noted). Flag now if there are constraints (existing infra, team skills, hosting) that should change it before more is built on top. Also pending: upgrade Apollo Server v4 (EOL 2026-01-26) → v5 / NestJS 11.
- **Multi-country / multi-currency from the start, or single-region MVP?** — changes how early the locale/statutory strategy layer is needed.

> Keep this section current. When a question is answered, move the decision up to "Current state & decisions" and delete it here.
