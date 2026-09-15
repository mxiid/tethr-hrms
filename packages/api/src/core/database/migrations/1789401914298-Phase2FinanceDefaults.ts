import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase2FinanceDefaults1789401914298 implements MigrationInterface {
    name = 'Phase2FinanceDefaults1789401914298'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "subTotal" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "totalAmount" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "client_billing_configs" ALTER COLUMN "feeAmount" SET DEFAULT '300'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_billing_configs" ALTER COLUMN "feeAmount" SET DEFAULT 300.00`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "totalAmount" SET DEFAULT 0.00`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "subTotal" SET DEFAULT 0.00`);
    }

}
