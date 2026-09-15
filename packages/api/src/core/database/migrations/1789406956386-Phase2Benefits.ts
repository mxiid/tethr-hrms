import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase2Benefits1789406956386 implements MigrationInterface {
    name = 'Phase2Benefits1789406956386'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "benefit_enrollments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "validFrom" date NOT NULL, "validTo" date, "employeeId" uuid NOT NULL, "planId" uuid NOT NULL, "note" character varying(300), CONSTRAINT "PK_ce5013d9170ab197dd40cbf9c6a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_daa743c1266e45617680058a9d" ON "benefit_enrollments" ("organizationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_67c3a36e2cb083c24804c00754" ON "benefit_enrollments" ("validFrom") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "benefit_enrollments_open_unique" ON "benefit_enrollments" ("organizationId", "employeeId", "planId") WHERE "validTo" IS NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_dc206c3980ef7bf998b37e2e73" ON "benefit_enrollments" ("organizationId", "employeeId") `);
        await queryRunner.query(`CREATE TABLE "benefit_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "code" character varying(32) NOT NULL, "name" character varying(120) NOT NULL, "description" character varying(300), "employeeContributionAmount" numeric(14,2) NOT NULL DEFAULT '0', "employerContributionAmount" numeric(14,2) NOT NULL DEFAULT '0', "reducesTaxable" boolean NOT NULL DEFAULT false, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_fc97578267a1979dfc992eafa64" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f676732d9a8aff6448a69e02a9" ON "benefit_plans" ("organizationId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "benefit_plans_org_code_unique" ON "benefit_plans" ("organizationId", "code") `);
        await queryRunner.query(`ALTER TABLE "payslip_lines" ADD "preTax" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "payroll_run_line_components" ADD "preTax" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payroll_run_line_components" DROP COLUMN "preTax"`);
        await queryRunner.query(`ALTER TABLE "payslip_lines" DROP COLUMN "preTax"`);
        await queryRunner.query(`DROP INDEX "public"."benefit_plans_org_code_unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f676732d9a8aff6448a69e02a9"`);
        await queryRunner.query(`DROP TABLE "benefit_plans"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dc206c3980ef7bf998b37e2e73"`);
        await queryRunner.query(`DROP INDEX "public"."benefit_enrollments_open_unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_67c3a36e2cb083c24804c00754"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_daa743c1266e45617680058a9d"`);
        await queryRunner.query(`DROP TABLE "benefit_enrollments"`);
    }

}
