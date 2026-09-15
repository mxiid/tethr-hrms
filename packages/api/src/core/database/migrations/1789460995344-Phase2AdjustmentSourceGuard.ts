import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase2AdjustmentSourceGuard1789460995344 implements MigrationInterface {
    name = 'Phase2AdjustmentSourceGuard1789460995344'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pay_adjustments" ADD CONSTRAINT "pay_adjustments_source_pair_check" CHECK (("sourceType" IS NULL) = ("sourceId" IS NULL))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pay_adjustments" DROP CONSTRAINT "pay_adjustments_source_pair_check"`);
    }

}
