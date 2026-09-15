import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase2TaxProfiles1789405194490 implements MigrationInterface {
    name = 'Phase2TaxProfiles1789405194490'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "employee_tax_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "validFrom" date NOT NULL, "validTo" date, "employeeId" uuid NOT NULL, "filerStatus" character varying(16) NOT NULL DEFAULT 'filer', "monthlyExemptionAmount" numeric(14,2) NOT NULL DEFAULT '0', "annualTaxCreditAmount" numeric(14,2) NOT NULL DEFAULT '0', "priorAnnualIncome" numeric(14,2) NOT NULL DEFAULT '0', "fixedMonthlyWithholding" numeric(14,2), "note" character varying(300), CONSTRAINT "PK_d999f32052f6cbc4d8534f03c92" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_39bcdf6cbfb49cf67e6324e4b3" ON "employee_tax_profiles" ("organizationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_3ef0d64178feea131e8793b649" ON "employee_tax_profiles" ("validFrom") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "employee_tax_profiles_open_unique" ON "employee_tax_profiles" ("organizationId", "employeeId") WHERE "validTo" IS NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_066da1a0930eef983757dc14de" ON "employee_tax_profiles" ("organizationId", "employeeId") `);
        await queryRunner.query(`ALTER TABLE "payslips" ADD "taxProfileSnapshot" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payslips" DROP COLUMN "taxProfileSnapshot"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_066da1a0930eef983757dc14de"`);
        await queryRunner.query(`DROP INDEX "public"."employee_tax_profiles_open_unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3ef0d64178feea131e8793b649"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_39bcdf6cbfb49cf67e6324e4b3"`);
        await queryRunner.query(`DROP TABLE "employee_tax_profiles"`);
    }

}
