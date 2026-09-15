import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase2AdjustmentSourceGuard1789460995344 implements MigrationInterface {
    name = 'Phase2AdjustmentSourceGuard1789460995344'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Provenance is only meaningful as a pair, and the old schema/input let
        // callers persist either half on its own. Clear the unusable half-pairs
        // before the CHECK is validated against every existing row; the money
        // fact itself is untouched.
        await queryRunner.query(`UPDATE "pay_adjustments" SET "sourceType" = NULL, "sourceId" = NULL WHERE ("sourceType" IS NULL) <> ("sourceId" IS NULL)`);
        // ADD ... NOT VALID takes only a brief ACCESS EXCLUSIVE for the catalog
        // change; the validation scan then runs under SHARE UPDATE EXCLUSIVE, so
        // concurrent reads and writes are not blocked while it completes.
        await queryRunner.query(`ALTER TABLE "pay_adjustments" ADD CONSTRAINT "pay_adjustments_source_pair_check" CHECK (("sourceType" IS NULL) = ("sourceId" IS NULL)) NOT VALID`);
        await queryRunner.query(`ALTER TABLE "pay_adjustments" VALIDATE CONSTRAINT "pay_adjustments_source_pair_check"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pay_adjustments" DROP CONSTRAINT "pay_adjustments_source_pair_check"`);
    }

}
