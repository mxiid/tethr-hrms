# Product Architecture Playbook

> A reusable architecture for building a modern SaaS product: monorepo-first, layered, code-first GraphQL, atom-based frontend state, decorator-driven backend modules. Mix and match — every section calls out when to deviate.

---

## 0. Guiding Principles

These are the assumptions everything else rests on. If you reject one of these, expect cascading changes downstream.

1. **One repo, many packages.** All code lives in a single monorepo. Dependencies flow one direction; no cycles.
2. **Layered, not flat.** Code is organized by *role* (shared → primitives → app), then by *feature* inside each layer. Avoid both extremes (one giant app, vs. dozens of microservices).
3. **Feature modules are self-contained.** A feature owns its UI, state, data access, types, and tests — co-located, not scattered.
4. **Code-first contracts.** Schemas (GraphQL, DB) are generated from typed code, not authored in DSLs by hand. The compiler is the source of truth.
5. **Conventions over configuration.** File suffixes, folder names, and naming carry meaning. Once a contributor knows the convention, they can predict the file layout of any feature.
6. **Composable, not inheritable.** Wire components, services, and state together with composition (props, DI tokens, atom derivation). Avoid deep inheritance.
7. **Strict types, no `any`.** TypeScript strict mode. No escape hatches in code that ships.
8. **Test behavior, not implementation.** Tests describe what the user (or caller) sees, not how internals work.

---

## 1. Monorepo Layout

### 1.1 Package responsibilities

A typical product fits this shape. Names are generic — adapt to your domain.

```
packages/
├── shared/          # zero-dependency types, constants, pure utilities
├── ui/              # styled primitives + theme tokens
├── app-frontend/    # the SPA — features, routing, state
├── app-backend/     # the API server — features, persistence
├── worker/          # background job processor (often same package as backend)
├── emails/          # transactional email templates
├── client-sdk/      # public SDK for API consumers (optional)
├── website/         # marketing / docs site (optional)
└── e2e/             # cross-package end-to-end tests
```

### 1.2 Dependency rules

Arrows point in the direction of *imports*. No cycles.

```
              ┌──────────────┐
              │   shared     │  (no monorepo deps)
              └──────┬───────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
     ┌─────┐    ┌────────┐   ┌──────────┐
     │ ui  │    │ worker │   │ backend  │
     └──┬──┘    └────┬───┘   └────┬─────┘
        │            │            │
        └────────────┼────────────┘
                     ▼
              ┌─────────────┐
              │  frontend   │
              └─────────────┘
```

**Rules:**
- `shared` imports nothing from the monorepo. It's the root of the dependency graph.
- `ui` imports only from `shared`.
- `backend` and `worker` import from `shared` (and from each other only if they're separate packages).
- `frontend` imports from `shared`, `ui`, and any client SDK.
- `frontend` and `backend` **never** import from each other. They communicate only via the API contract.

### 1.3 What goes in `shared`

The hardest discipline in a monorepo. Be ruthless.

| Belongs in `shared` | Does NOT belong in `shared` |
|---|---|
| Pure utility functions (`isDefined`, `assertNever`) | Anything that imports React, NestJS, or a server-only library |
| Enums and string-literal unions used by both sides | Database entities |
| Branded types, primitive validators | UI components |
| Constants (default limits, error codes) | Anything that touches `process.env` |
| API contract types — request/response shapes | Business logic |

### 1.4 What goes in `ui`

- Theme tokens (colors, spacing, typography, motion)
- Primitive components (Button, Input, Modal, Tooltip, Icon wrapper)
- Layout primitives (Stack, Grid, Container)
- *Zero* product knowledge — `ui` should be reusable across products

If a component knows about your domain entities, it belongs in `frontend`, not `ui`.

---

## 2. Backend Architecture

### 2.1 The two-bucket rule

Split your backend code into two top-level buckets:

```
backend/src/
├── core/        # infrastructure & cross-cutting concerns
│   ├── auth/
│   ├── users/
│   ├── billing/
│   ├── workspace/
│   ├── audit-log/
│   └── feature-flag/
└── modules/     # domain features
    ├── projects/
    ├── tasks/
    ├── messaging/
    └── integrations/
```

- **`core/`** contains things every other module depends on: authentication, tenancy, users, billing, feature flags, audit logging, framework wiring. These are *infrastructure*.
- **`modules/`** contains your product's domain features. They depend on `core/`, never the reverse.

This split prevents the common drift where auth helpers leak into every feature module.

### 2.2 Anatomy of a feature module

A feature module is a folder with a predictable shape:

```
modules/projects/
├── projects.module.ts          # DI wiring — imports, providers, exports
├── projects.resolver.ts        # GraphQL resolver (or .controller.ts for REST)
├── projects.service.ts         # Business logic — the only file with rules
├── projects.entity.ts          # Persistence schema (ORM entity)
├── projects.repository.ts      # Optional — custom queries beyond ORM defaults
├── dto/
│   ├── create-project.input.ts
│   ├── update-project.input.ts
│   └── project.output.ts
├── guards/                     # Authorization specific to this module
├── strategies/                 # Optional — auth / parsing strategies
├── types/                      # Internal types (not exported)
├── utils/                      # Pure helpers for this module
└── *.spec.ts                   # Unit tests, co-located
```

**File suffix conventions** — pick a set, then enforce it:

| Suffix | Role |
|---|---|
| `.module.ts` | DI container definition |
| `.controller.ts` / `.resolver.ts` | HTTP / GraphQL entrypoint |
| `.service.ts` | Business logic |
| `.entity.ts` | ORM entity / table mapping |
| `.repository.ts` | Custom queries |
| `.dto.ts` / `.input.ts` / `.output.ts` | Boundary types |
| `.guard.ts` | Authorization check |
| `.spec.ts` | Unit tests |
| `.integration-spec.ts` | Integration tests |

### 2.3 The layer rules

| Layer | Knows about | Returns | Must not |
|---|---|---|---|
| **Resolver / Controller** | DTOs, services | DTO / output type | Do business logic, hit the DB directly |
| **Service** | Repositories, other services, domain types | Domain types | Know about HTTP, GraphQL, or DTOs |
| **Repository** | Entities, ORM | Entities | Know about services, DTOs |
| **Entity** | Itself | n/a | Have business methods beyond simple invariants |

If a service method needs to know whether it was invoked over HTTP or GraphQL, you've leaked the boundary.

### 2.4 Authorization

Two layers:

1. **Guards** at the entrypoint — coarse: "is this caller authenticated? do they belong to this workspace?"
2. **Service-level checks** — fine: "does this user have permission to update *this specific* resource?"

Don't put fine-grained checks in guards (hard to test) or coarse checks in services (duplicated everywhere).

### 2.5 Code-first GraphQL (or REST)

If using GraphQL: define your schema in decorators on TypeScript classes. The schema file is generated, never hand-edited.

```ts
@Resolver(() => Project)
export class ProjectsResolver {
  constructor(private readonly projectsService: ProjectsService) {}

  @Query(() => [Project])
  @UseGuards(WorkspaceAuthGuard)
  projects(@CurrentWorkspace() workspace: Workspace) {
    return this.projectsService.findAll(workspace.id);
  }

  @Mutation(() => Project)
  createProject(@Args('input') input: CreateProjectInput) {
    return this.projectsService.create(input);
  }
}
```

The same shape works for REST controllers — replace `@Query`/`@Mutation` with `@Get`/`@Post`.

### 2.6 Tenancy

If you're multi-tenant, every query must be tenant-scoped at the lowest possible level (repository or ORM middleware), not at the resolver. Resolvers and services should be unable to *forget* to scope. Make it the default; opt out explicitly when (rarely) needed.

---

## 3. Persistence & Migrations

### 3.1 ORM entities

- One entity per table, decorated with column/index metadata.
- Entities live next to the feature that owns them (`modules/projects/projects.entity.ts`).
- Entities are *dumb* — fields, indexes, relations. No methods beyond trivial invariants.
- Cross-entity logic lives in services.

### 3.2 Two-track migrations

Most products eventually need this split:

| Schema migration | Data migration / instance command |
|---|---|
| Auto-generated from entity diffs | Hand-written |
| `CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX` | Backfills, transforms, denormalization |
| Runs once per environment, fast | May run long; idempotent; resumable |
| Tracked in `migrations/` | Tracked in `commands/upgrade/<version>/` |

Naming: timestamp prefix + descriptive slug (`20260618-0001-add-project-archived-at.ts`). Never rewrite a committed migration's `up` — write a new one.

### 3.3 Versioning your operational scripts

Group instance commands under a version folder (`commands/upgrade/v0.42.0/`). On deploy, run all commands not yet recorded in a `_executed_commands` table. This lets you ship data fixes the same way you ship code.

---

## 4. Background Jobs

### 4.1 Queue abstraction

Don't import your queue library (BullMQ, SQS, Cloud Tasks) into business code. Wrap it:

```ts
@Processor(Queue.EmailQueue)
export class SendWelcomeEmailProcessor {
  @Process(Job.SendWelcomeEmail)
  async handle(payload: SendWelcomeEmailJob) { /* ... */ }
}
```

Business code calls `messageQueue.add(Queue.EmailQueue, Job.SendWelcomeEmail, payload)` — the underlying queue can be swapped without touching callers.

### 4.2 Where processors live

Co-locate with the feature that produces or consumes the work:

```
modules/notifications/
├── notifications.module.ts
├── notifications.service.ts
└── jobs/
    ├── send-welcome-email.processor.ts
    └── send-digest-email.processor.ts
```

Not in a global `jobs/` folder. The feature that owns the job owns the processor.

### 4.3 Events vs jobs

- **Event** = something happened. Pub/sub. Multiple listeners, fire-and-forget.
- **Job** = something must happen. Queue. One consumer, retried until done.

If you find yourself writing a "job" that publishes an event that triggers another job, you wanted events the whole time.

---

## 5. Frontend Architecture

### 5.1 Feature module shape

Mirror the backend's discipline. Each feature lives in `frontend/src/modules/<feature>/` with these subfolders:

```
modules/projects/
├── components/        # React components owned by this feature
│   ├── ProjectCard.tsx
│   ├── ProjectList.tsx
│   └── __stories__/
│       └── ProjectCard.stories.tsx
├── hooks/             # useProject(), useCreateProject()
├── states/            # Jotai atoms, families, selectors
├── graphql/           # .graphql queries/mutations
├── services/          # Plain TS — data transforms, API helpers
├── types/             # Local types
├── utils/             # Pure helpers
├── constants/
└── __tests__/         # Unit tests
```

**Naming suffixes:**

| Suffix | Role |
|---|---|
| `*State.ts` | A Jotai atom |
| `*FamilySelector.ts` / `*Family.ts` | A parameterized atom family |
| `use*.ts` | A React hook |
| `*.stories.tsx` | A Storybook story |
| `*.test.ts(x)` | A unit test |

### 5.2 State management with atoms

Three tiers:

1. **Atoms** — primitive global state.
   ```ts
   export const currentProjectIdState = createAtomState<string | null>({
     key: 'currentProjectIdState',
     defaultValue: null,
   });
   ```

2. **Atom families** — atoms parameterized by key (one atom *per id*).
   ```ts
   export const projectByIdFamily = atomFamily((id: string) =>
     atom<Project | null>(null),
   );
   ```

3. **Selectors** — derived/computed atoms. No setter unless write-back is intended.
   ```ts
   export const activeProjectsSelector = selector(({ get }) =>
     get(allProjectsState).filter(p => !p.archivedAt),
   );
   ```

**Rules:**
- Component-local state stays in `useState` / `useReducer`. Atoms are for *cross-component* state.
- Server data lives in the GraphQL/HTTP cache (Apollo, React Query). Don't duplicate it in atoms.
- Atoms are for UI state (selected row, panel open, draft form values) and derived state from cache.

### 5.3 Components

- **Functional components only**, with hooks.
- **Named exports only.** No default exports.
- **Props down, events up.** Children get data via props, communicate via callback props. No "magic" prop drilling through context except for genuinely tree-wide concerns (theme, current user).
- **One component per file.** File name = component name = directory name (if the component has stories/tests).

```
components/
├── ProjectCard/
│   ├── ProjectCard.tsx
│   ├── ProjectCard.test.tsx
│   ├── ProjectCard.stories.tsx
│   └── index.ts        # re-export
```

### 5.4 Hooks

A hook lives in `hooks/` if it's stateful or composes other hooks. Pure functions go in `utils/`. Name hooks for what they *return* or *do*:

- `useProject(id)` — returns a project
- `useCreateProject()` — returns a mutation function
- `useIsProjectOwner(id)` — returns a boolean

If a hook's name doesn't start with `use`, it isn't a hook.

### 5.5 GraphQL client

- Apollo Client (or urql/Relay) holds the cache.
- Queries / mutations are authored in `.graphql` files alongside the feature.
- A codegen step generates typed hooks (`useGetProjectsQuery`, `useCreateProjectMutation`) into `src/generated/`.
- Components import generated hooks — never write a raw `useQuery(gql\`...\`)`.

### 5.6 Routing

Treat routes as a thin layer. Each route renders a *page component* that lives in the feature module:

```
modules/projects/
├── pages/
│   ├── ProjectsListPage.tsx
│   └── ProjectDetailPage.tsx
```

The router file maps URLs to page components and nothing more.

---

## 6. Shared Patterns

### 6.1 Type strictness

- `strict: true` in `tsconfig.base.json`. No exceptions.
- No `any`. If you must, narrow it immediately with a type guard from `shared`.
- No `as` casts except for narrow ORM/library escape hatches, commented with why.
- Branded types for IDs: `type ProjectId = string & { readonly __brand: 'ProjectId' }`. Prevents passing a `UserId` where a `ProjectId` is expected.

### 6.2 Naming conventions

| Kind | Style | Example |
|---|---|---|
| Variables, functions | camelCase | `currentUser`, `findById` |
| Types, classes | PascalCase | `ProjectService`, `CreateProjectInput` |
| Component props type | `<Name>Props` | `ButtonProps` |
| React components | PascalCase | `ProjectCard` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE_BYTES` |
| Files | kebab-case + suffix | `project-card.tsx`, `projects.service.ts` |
| Generics | descriptive PascalCase | `TData`, `TError` (not `T`, `U`) |
| Booleans | `is*` / `has*` / `should*` | `isLoading`, `hasAccess` |

No abbreviations: `fieldMetadata` not `fm`, `user` not `u`, `repository` not `repo`.

### 6.3 String literals vs enums

Prefer string literal unions over TypeScript `enum`:

```ts
// good
type ProjectStatus = 'draft' | 'active' | 'archived';

// avoid
enum ProjectStatus { Draft = 'draft', Active = 'active', Archived = 'archived' }
```

Enums create runtime objects, complicate tree-shaking, and don't tree-narrow as cleanly. The exception is GraphQL enums, which require enum syntax for codegen.

### 6.4 Comments

- Comments explain **why**, not **what**. Code says what.
- Single-line `//` for almost everything. Reserve JSDoc for public-package exports.
- Multi-line comments are stacked `//` lines, not `/* */` blocks.
- Delete commented-out code. Git remembers.

### 6.5 Error handling

- **Service boundary**: throw typed errors (`ProjectNotFoundError extends DomainError`).
- **API boundary**: an exception filter maps domain errors to HTTP/GraphQL responses.
- **Client**: errors come back as typed unions on the response. No try/catch around every fetch.
- **Validation**: at the boundary (DTO with class-validator, zod, valibot). Internal code trusts its inputs.

---

## 7. Path Aliases & Imports

Aliases reduce relative-path noise (`../../../`) but multiplied indiscriminately they hide the dependency graph. Pick a small set:

| Alias | Resolves to | Use for |
|---|---|---|
| `@/*` | `src/modules/*` | Cross-feature imports inside the app |
| `~/*` | `src/*` | Framework, generated, root-level utilities |
| `@<scope>/<pkg>` | npm-style package name | Cross-package imports inside the monorepo |

**Rules:**

- Relative imports (`./`, `../`) for files in the *same* feature module.
- Alias imports (`@/feature/...`) for imports from a *different* feature module in the same app.
- Package imports (`@my-product/ui`) for cross-package.
- **Never** `../../../../shared` to escape an alias boundary. If you need it, fix the alias.

Import order in every file:

```ts
// 1. External
import { useEffect } from 'react';
import { gql } from '@apollo/client';

// 2. Cross-package
import { Button } from '@my-product/ui';
import { isDefined } from '@my-product/shared';

// 3. Cross-feature (alias)
import { useCurrentUser } from '@/auth/hooks/useCurrentUser';

// 4. Same-feature (relative)
import { ProjectCard } from './ProjectCard';
import type { Project } from './types';
```

Auto-enforced by lint rules (`import/order`).

---

## 8. Testing Strategy

### 8.1 The pyramid

| Layer | Share | What it tests |
|---|---|---|
| Unit | ~70% | Functions, hooks, services in isolation |
| Integration | ~20% | A service + its repository + real DB; a component tree + a mocked store |
| End-to-end | ~10% | A real user flow against a real (test) backend |

### 8.2 Where tests live

- **Unit**: co-located. `project.service.ts` ↔ `project.service.spec.ts`. Components: `__tests__/` subfolder or sibling file.
- **Integration**: co-located, `.integration-spec.ts` suffix, separate Jest config that boots a test database.
- **E2E**: separate package (`packages/e2e/`). Owns its own test infrastructure.
- **Storybook**: `__stories__/` subfolder next to the component.

### 8.3 Test style

- **Query by user-visible elements** (text, role, label) before test IDs. Test IDs are a fallback.
- **Use real user-event interactions** (`@testing-library/user-event`), not synthetic `fireEvent`.
- **Names describe behavior**: `"renders the empty state when there are no projects"`, not `"test1"`.
- **Mock the boundary, not the internals.** Mock `fetch` / Apollo link, not the service.
- **Clear mocks** with `jest.clearAllMocks()` in `afterEach`. Tests must be independent.

### 8.4 What not to test

- Auto-generated code (GraphQL types, ORM migrations).
- Third-party library internals.
- Component snapshots beyond a smoke test — they break on every refactor and prove nothing.

---

## 9. Build & Tooling

### 9.1 Task orchestrator

Use a task runner that understands your dependency graph — Nx, Turborepo, Bazel, or similar. Each package declares:

| Target | Does |
|---|---|
| `build` | Produces shippable artifacts |
| `start` | Runs the package in dev mode (watch, HMR) |
| `test` | Runs unit tests |
| `test:integration` | Runs integration tests |
| `lint` | Lints the package |
| `lint:diff-with-main` | Lints only files changed from main — fast feedback loop |
| `typecheck` | Type-checks without emitting |
| `fmt` | Formats source |

Cross-package dependencies declared via `dependsOn` so the runner builds in topological order and caches aggressively.

### 9.2 Caching

- Hash inputs (source files, config, lockfile). Same inputs → reuse last output.
- Separate "production" inputs from "test" inputs so test changes don't invalidate the production build.
- Remote cache for CI (S3, Nx Cloud, Turbo remote cache).

### 9.3 Lint, format, typecheck

- **Lint** is for correctness (unused vars, missing await, react-hooks rules). Fast, runs on every commit.
- **Format** is for style. Auto-applied. Never debated in PRs.
- **Typecheck** is the cheapest correctness signal you have. Run it in CI on every PR.

### 9.4 Pre-commit hooks

Husky + lint-staged: format and lint only the staged files. Type-check is too slow for pre-commit — leave it for CI.

---

## 10. Styling

### 10.1 The styling stack

Pick one of these and commit. Don't mix.

| Choice | Strength | Cost |
|---|---|---|
| **Zero-runtime CSS-in-JS** (Linaria, Vanilla Extract, Panda) | Type-safe + zero runtime + co-located | Build complexity |
| **Utility classes** (Tailwind) | Fast iteration, no naming | Verbose markup, harder to abstract |
| **CSS Modules** | Simple, native, scoped | No theme system out of the box |
| **Runtime CSS-in-JS** (styled-components, emotion) | Powerful, dynamic | Runtime cost, SSR pain |

Whatever you pick: **theme tokens come from one place** (`ui/theme/`) and are exposed as CSS variables. Components read tokens, never hard-coded values.

### 10.2 Design tokens

See the design language document for token shape. Architecturally:

- Tokens defined in `ui/theme/` as plain TS objects.
- Compiled to CSS variables at build time.
- Components consume via `theme.color.text.primary`, not `"#222"`.

---

## 11. Code Generation

What to generate, what to hand-write:

| Generate | Hand-write |
|---|---|
| GraphQL types & hooks from `.graphql` files | Resolvers, mutations |
| GraphQL schema from decorators | Service logic |
| ORM types from entity classes | Migrations beyond `--auto-generated` |
| API client SDK from OpenAPI/GraphQL schema | Tests |
| i18n type-safe keys from translation files | Translations themselves |

Generated code lives in `src/generated/` and is gitignored *unless* its absence breaks `nx build` for a fresh checkout. If it must be committed, document the regeneration command in the README.

---

## 12. Configuration & Secrets

- **`.env.example`** in every package that reads env vars. Lists every variable with a default or `<required>` placeholder.
- **Config service** wraps `process.env`. Application code reads `configService.get('DATABASE_URL')`, never `process.env.DATABASE_URL` directly.
- **Schema-validate** the config at startup. Fail fast if a required var is missing or malformed.
- **Secrets never in the repo.** Even in `.env.example` — show the *shape*, not the value.

---

## 13. Observability

Three signals, in increasing order of detail:

1. **Logs** — structured JSON, one logger module. Levels: trace / debug / info / warn / error. No `console.log` in committed code.
2. **Metrics** — counters, histograms. Cardinality kept low (tag with workspace tier, not workspace id).
3. **Traces** — OpenTelemetry. Spans wrap service methods and database calls.

A single request should be traceable end-to-end: client → backend → worker → external API → back.

---

## 14. Development Environment

One script bootstraps everything:

```bash
bash scripts/setup-dev.sh
```

What it does:
- Uses the hosted Postgres (Supabase) connection settings from each package's `.env` — no local database daemon to run.
- Copies `.env.example` to `.env` for each package that needs it.
- Runs migrations.
- Is **idempotent** — safe to re-run.

The API and web app need only Postgres. The background-job package (`packages/worker`)
uses a Redis-backed queue; stand up Redis only if and when you run the worker.

Flags: `--down` (stop anything the script started), `--reset` (drop and re-create the schema).

CI does *not* run this script — CI provisions its own Postgres and runs setup steps individually.

---

## 15. When to Deviate

This playbook is a starting shape, not a cage. Deviate when:

- **You're prototyping.** A throwaway demo doesn't need 18 packages. Start in one. Split when growth demands it.
- **You're scaling past a single team.** When >1 team owns parts of the system, the monorepo's discipline starts to creak. Consider package ownership rules, code-owners, and selective extraction.
- **A feature genuinely needs different tech.** Don't force a real-time collaboration feature into the REST/GraphQL service if it needs a websocket-first design. Carve it into its own package.
- **The cost of the abstraction exceeds the cost it prevents.** A 2-line "service" called by exactly one resolver is not a service — it's overhead. Inline it.

The principle behind the playbook: *predictability*. A contributor who's read it should be able to predict where any new code goes. The moment a deviation makes things *more* predictable for your context, take it.

---

## Appendix A: Decision Cheat Sheet

| If you're building... | Start with... |
|---|---|
| Internal tool, single team, <6 months runway | Single package, no monorepo, just the layered backend + frontend pattern |
| SaaS product, multi-tenant, multi-year horizon | This whole playbook |
| API-only product, no UI | Drop `frontend` and `ui`. Keep everything else |
| Library / SDK | Skip backend; `shared` + `package` + `e2e` |
| Mobile-first product | Add `mobile` package; share types via `shared` |

## Appendix B: Anti-patterns to Avoid

- **Shared utility folder bloat.** `shared/utils/index.ts` re-exporting 200 helpers. Split by domain or move to feature modules.
- **God services.** A `UserService` with 60 methods. Split by concern (`UserAuthService`, `UserProfileService`, `UserBillingService`).
- **Cross-feature atom imports.** Feature A reading atoms from Feature B's `states/` folder. Promote the atom to a `shared` location or expose it via a hook.
- **Resolver business logic.** If your resolver method is longer than 5 lines, it's doing too much.
- **Entity methods.** ORM entities with `user.canEdit(project)` methods. Put it in a service or a pure function.
- **Default exports.** They break refactoring tools and let importers rename arbitrarily. Named exports always.
- **`any` to "fix" a type error.** You haven't fixed it; you've hidden it.
- **Migration rewrites.** Editing an already-shipped migration. Always add a new one.
