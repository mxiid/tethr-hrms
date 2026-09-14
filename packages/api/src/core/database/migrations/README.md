# Migrations

Schema migrations live here, one file per change (architecture.md §3.2). They are
generated from entity diffs against a running database — never hand-authored for
routine changes, and a committed migration's `up` is never rewritten.

## The baseline

`1789390244861-InitialSchema.ts` is the initial baseline: it creates the entire
schema as of the ATS work, generated from an empty database. Nothing preceded it,
so there is no incremental history to replay — apply it to any fresh database.

```bash
npm run migration:run -w @hrms/api
```

A database that was created by `DATABASE_SYNCHRONIZE=true` (every local dev DB
so far) already has those tables, so running the baseline would fail on
`CREATE TABLE ... already exists`. Mark it as applied instead of executing it:

```bash
npm run migration:run:fake -w @hrms/api
```

`--fake` records the migration without touching the schema, so the ledger and the
database agree from then on.

## Generate the next migration

With Postgres running (`bash scripts/setup-dev.sh`):

```bash
npm run migration:generate -w @hrms/api -- src/core/database/migrations/SomeChange
npm run migration:run -w @hrms/api
```

To generate a clean diff, point the CLI at an empty database — against a
synchronize-managed dev DB the diff is always empty:

```powershell
$env:DATABASE_NAME='scratch_db'; $env:DATABASE_SYNCHRONIZE='false'
npm run migration:generate -w @hrms/api -- src/core/database/migrations/SomeChange
```

Two conventions the CLI depends on:

- **Entity files must match `*.entity.ts`** — the data-source loads
  `**/*.entity.{ts,js}`. The Nest app uses `autoLoadEntities`, so an entity in a
  differently-named file works at runtime but silently disappears from generated
  migrations (that is how the tax-slab tables were first missed).
- The baseline inserts `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` because uuid
  primary keys default to `uuid_generate_v4()`; it is not dropped in `down()`
  since other schemas may rely on it.

## Local shortcut

For throwaway local databases, `DATABASE_SYNCHRONIZE=true` (the dev `.env`
default) auto-creates tables from the entities so you can run without a migration.
Never enable synchronize in shared/staging/production — generate and run
migrations there.
