import { MigrationInterface, QueryRunner } from "typeorm";

export class ApplicationsUniqueActive1789471311404 implements MigrationInterface {
    name = 'ApplicationsUniqueActive1789471311404'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Legacy duplicates would block the index. Keep the earliest active
        // application per person and posting, and end the later ones as rejected
        // (the person may apply again once the row is terminal). No-op on a
        // database that never allowed duplicates.
        await queryRunner.query(`WITH ranked AS (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY "organizationId", "candidateId", "jobPostingId"
              ORDER BY "createdAt" ASC, id ASC
            ) AS rn
            FROM "applications"
            WHERE "outcome" = 'active'
          )
          UPDATE "applications"
          SET "outcome" = 'rejected',
              "notes" = COALESCE("notes" || chr(10), '') || 'Closed as a duplicate of an earlier active application.'
          WHERE id IN (SELECT id FROM ranked WHERE rn > 1)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "applications_org_candidate_posting_active_unique" ON "applications" ("organizationId", "candidateId", "jobPostingId") WHERE "outcome" = 'active'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."applications_org_candidate_posting_active_unique"`);
    }

}
