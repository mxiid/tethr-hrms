import { MigrationInterface, QueryRunner } from "typeorm";

const RANKED_DUPLICATES = `WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "candidateId", "jobPostingId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
    FROM "applications"
    WHERE "outcome" = 'active'
  )`;

export class ApplicationsUniqueActive1789471311404 implements MigrationInterface {
    name = 'ApplicationsUniqueActive1789471311404'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Legacy duplicates would block the index. Keep the earliest active
        // application per person and posting, and end the later ones as rejected
        // (the person may apply again once the row is terminal). No-op on a
        // database that never allowed duplicates. The changed rows are recorded
        // first so `down()` can restore them: this is a data migration and must
        // be reversible, not a one-way outcome rewrite.
        //
        // The backup table is migration-only state with no entity; a later
        // regeneration against the schema should drop it once this cleanup is
        // considered permanent (this migration file's `down` is its only user).
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "applications_duplicate_cleanup_backup" (
            "id" uuid PRIMARY KEY,
            "outcome" varchar(16) NOT NULL,
            "notes" text,
            "recordedAt" timestamptz NOT NULL DEFAULT now()
        )`);
        await queryRunner.query(`${RANKED_DUPLICATES}
          INSERT INTO "applications_duplicate_cleanup_backup" ("id", "outcome", "notes")
          SELECT a.id, a.outcome, a.notes
          FROM "applications" a
          JOIN ranked r ON r.id = a.id
          WHERE r.rn > 1
          ON CONFLICT ("id") DO NOTHING`);
        await queryRunner.query(`${RANKED_DUPLICATES}
          UPDATE "applications"
          SET "outcome" = 'rejected',
              "notes" = COALESCE("notes" || chr(10), '') || 'Closed as a duplicate of an earlier active application.'
          WHERE id IN (SELECT id FROM ranked WHERE rn > 1)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "applications_org_candidate_posting_active_unique" ON "applications" ("organizationId", "candidateId", "jobPostingId") WHERE "outcome" = 'active'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // The index must go first: restoring a row to 'active' while another
        // active row for the same (candidate, posting) exists would violate it.
        // Then restore the outcomes and notes the cleanup rewrote, so reverting
        // never silently loses the prior application state. A database that
        // applied the pre-reversibility version of this migration has no backup
        // table; the guarded block makes that revert a clean index drop.
        await queryRunner.query(`DROP INDEX "public"."applications_org_candidate_posting_active_unique"`);
        await queryRunner.query(`DO $$
          BEGIN
            IF to_regclass('public.applications_duplicate_cleanup_backup') IS NOT NULL THEN
              UPDATE "applications" a
              SET "outcome" = b."outcome", "notes" = b."notes"
              FROM "applications_duplicate_cleanup_backup" b
              WHERE a.id = b.id;
              DROP TABLE "applications_duplicate_cleanup_backup";
            END IF;
          END $$`);
    }

}
