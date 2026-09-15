import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase2BenefitSnapshots1789453096644 implements MigrationInterface {
    name = 'Phase2BenefitSnapshots1789453096644'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "benefit_enrollments" ADD "employeeContributionAmount" numeric(14,2)`);
        await queryRunner.query(`ALTER TABLE "benefit_enrollments" ADD "employerContributionAmount" numeric(14,2)`);
        await queryRunner.query(`ALTER TABLE "benefit_enrollments" ADD "reducesTaxable" boolean`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "benefit_enrollments" DROP COLUMN "reducesTaxable"`);
        await queryRunner.query(`ALTER TABLE "benefit_enrollments" DROP COLUMN "employerContributionAmount"`);
        await queryRunner.query(`ALTER TABLE "benefit_enrollments" DROP COLUMN "employeeContributionAmount"`);
    }

}
