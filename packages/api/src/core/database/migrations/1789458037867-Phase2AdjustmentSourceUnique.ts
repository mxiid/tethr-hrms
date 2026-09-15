import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase2AdjustmentSourceUnique1789458037867 implements MigrationInterface {
    name = 'Phase2AdjustmentSourceUnique1789458037867'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "pay_adjustments_org_source_unique" ON "pay_adjustments" ("organizationId", "sourceType", "sourceId") WHERE "sourceId" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."pay_adjustments_org_source_unique"`);
    }

}
