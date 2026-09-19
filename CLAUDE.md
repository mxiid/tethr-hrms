# CLAUDE.md — read this first

> Loaded automatically each session. This is the orientation; the detailed reasoning lives in the four docs below.

## What this is

A **modular HRMS** built as a **modular monolith**: one deployable system, internally partitioned into strict modules, each extractable into its own service later *without a rewrite*. The overriding requirement: **the structure must stay coherent as it scales — it must not crumble.** When facing a design choice, the tiebreaker is "which option keeps modules decoupled and independently extractable."

## The doc set (read in order)

1. [context.md](context.md) — what we're doing and how the user likes to work. **First, always.**
2. [architecture.md](architecture.md) — the reusable, product-agnostic playbook. Before any structural decision.
3. [plan.md](plan.md) — that playbook instantiated for this HRMS (modules, spine, roadmap). Before any feature.
4. [design.md](design.md) — the visual language (tokens, components). Before any UI.

## Non-negotiables (full rationale in plan.md §1, §5)

1. **Each module owns its data.** No cross-module table reads, no cross-module JOINs. Access via a published service interface or a domain event.
2. **No cross-module database foreign keys.** Modules reference each other by ID only.
3. **Reference the employee; snapshot for history.** Live data referenced by `employeeId`; anything legal/financial/audited snapshots the values it used.
4. **Effective-dated from day one.** Backbone facts carry `validFrom`/`validTo`; queries ask "as of date X".
5. **Configuration is data, not code.** Policies, approval chains, pay components, grades — tenant-scoped data driving generic engines.
6. **`User` ≠ `Employee`.** Login identity and HR record are separate, optionally linked.
7. **Three communication channels only:** published interfaces (sync reads), domain events (async side effects), immutable snapshots (history).

## Conventions

- **Two-bucket backend:** `core/` = platform (auth, tenancy, RBAC, workflow, notifications, documents, audit, config, events). `modules/` = HR domain. `modules/` depends on `core/`, **never** the reverse (enforced by ESLint `import/no-restricted-paths`).
- **Strict TypeScript, no `any`.** Named exports only. Functional components only. String-literal unions over enums (except GraphQL). Types over interfaces.
- **No abbreviations** (`employee` not `emp`).
- **Code-first contracts**: GraphQL schema / ORM types generated from typed code. Generated code in `src/generated/`.
- **Events for side effects** via an outbox (transactional publish) + idempotent consumers — never deep synchronous call chains.
- **Tenancy scoped at the data layer** (`TenantScopedRepository`) so code cannot forget to scope.
- **Design**: tokens only (from `@hrms/ui`), 4px spacing grid, Inter, indigo accent, Tabler icons, light/dark parity.
- **UI compliance**: when reviewing or adding UI, fetch the live Web Interface Guidelines (`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`), check against them, and report in terse `file:line` format. Two documented deviations: sentence case (not Title Case) for headings and buttons, and no `translate="no"` while the app is single-locale.
- **PRs**: when opening a pull request, mention `@greptile-apps` in the description or a comment to trigger the Greptile review.

## Layout

```
packages/
├── shared/   # @hrms/shared — zero-dep contracts: branded IDs, unions, event payloads, utils
├── ui/       # @hrms/ui — design tokens (light+dark) + CSS variables
├── api/       # @hrms/api — modular-monolith backend (NestJS); core/ + modules/
├── worker/   # @hrms/worker — background jobs (queue abstraction)
└── web/      # @hrms/web — React + Vite + Jotai SPA
```

## Commands

```bash
bash scripts/setup-dev.sh     # one-shot dev bootstrap (.env seed, install, migrate; DB is hosted Supabase)
npm run typecheck             # type-check every package (build order respected)
npm run build                 # build all packages
npm run lint                  # eslint (incl. module-boundary rules)
npm test                      # unit tests across packages
```

## Stack (working default — see context.md "Current state & decisions")

TypeScript end-to-end · NestJS + TypeORM + PostgreSQL (hosted on Supabase) · code-first GraphQL · React + Vite + Jotai-style atoms · **npm workspaces** monorepo (chosen over Nx for zero-install verifiability — a documented deviation per architecture.md §15). Redis is used only by `packages/worker` for its job queue.

## Roadmap (dependency-ordered — build in this order)

Phase 0 Platform → 1 Core HR spine → 2 Time off & attendance → 3 Pay → 4 Lifecycle & talent → 5 Services & insight.

**Current state:** Phases 0–2 **plus authentication, the app shell, and the Sept 2026 audit's remediation phases** (data integrity, reliability, and security/session hardening), verified against a hosted Supabase Postgres. In place: platform guardrails, the Phase 1 spine (organization, position, employee, assignment), Phase 2 (leave & absence, attendance & time tracking), JWT auth with **deny-by-default authorization and immediate session revocation** (`tokenVersion` + a global `SessionGuard`; signup creates org+admin; login/me; tenant derived from the token), and a live web app (login → dashboard → live Employees; protected routes; workspace switching with a cleared cache). Build/typecheck/lint and 443 tests green (2 skipped, Redis-gated); backend flows covered by smoke tests, the web verified end to end in the browser. Auth lives in `core/auth` (login/me) + `modules/account` (signup, onboarding, workspace users). See [docs/STATUS.md](docs/STATUS.md).
