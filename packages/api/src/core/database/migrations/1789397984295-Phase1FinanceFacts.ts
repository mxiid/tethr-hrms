import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase1FinanceFacts1789397984295 implements MigrationInterface {
    name = 'Phase1FinanceFacts1789397984295'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "payroll_cost_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "payrollRunId" uuid NOT NULL, "periodYear" integer NOT NULL, "periodMonth" integer NOT NULL, "payDate" date NOT NULL, "payrollCurrency" character varying(3) NOT NULL, "billingCurrency" character varying(3) NOT NULL, "fxRate" numeric(18,8), "grossTotal" numeric(14,2) NOT NULL, "employerCostTotal" numeric(14,2) NOT NULL, "convertedEmployerCost" numeric(14,2), "employeeCosts" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_33641f1c1e3038624cf8589c36b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_917ffe8d77381661dbd013e1bb" ON "payroll_cost_snapshots" ("organizationId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "payroll_cost_snapshots_org_run_unique" ON "payroll_cost_snapshots" ("organizationId", "payrollRunId") `);
        await queryRunner.query(`CREATE TABLE "billing_period_closes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "serviceYear" integer NOT NULL, "serviceMonth" integer NOT NULL, "payrollRunId" uuid NOT NULL, "payDate" date NOT NULL, "currency" character varying(3) NOT NULL, "invoiceCount" integer NOT NULL, "invoicedAmount" numeric(14,2) NOT NULL, "payrollCostAmount" numeric(14,2), "varianceAmount" numeric(14,2), "status" character varying(16) NOT NULL, CONSTRAINT "PK_0dd66a6e9f2358e539f840ea029" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_236d9043c88affc30c220ecdd4" ON "billing_period_closes" ("organizationId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "billing_period_closes_org_period_unique" ON "billing_period_closes" ("organizationId", "serviceYear", "serviceMonth") `);
        await queryRunner.query(`ALTER TABLE "payslips" ADD "deductionsAmount" numeric(14,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "payslips" ADD "employerContributionAmount" numeric(14,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "payslips" ADD "employerCostAmount" numeric(14,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD "payDate" date`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD "finalizeOverrideGuards" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD "grossTotal" numeric(14,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD "deductionsTotal" numeric(14,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD "netTotal" numeric(14,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD "employerContributionTotal" numeric(14,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD "employerCostTotal" numeric(14,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD "paidAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD "paymentReference" character varying(120)`);
        await queryRunner.query(`ALTER TABLE "final_settlements" ADD "paidAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "final_settlements" ADD "paymentReference" character varying(120)`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "reconciliationStatus" character varying(16) NOT NULL DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "payrollCostAmount" numeric(14,2)`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "reconciledAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "issuedSnapshot" jsonb`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "isStale" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "staleReason" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "subTotal" SET DEFAULT '0.00'`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "totalAmount" SET DEFAULT '0.00'`);
        await queryRunner.query(`ALTER TABLE "client_billing_configs" ALTER COLUMN "feeAmount" SET DEFAULT '300.00'`);
        await queryRunner.query(`DROP INDEX "public"."invoices_org_group_type_period_unique"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "invoices_org_group_type_period_unique" ON "invoices" ("organizationId", "groupId", "type", "serviceYear", "serviceMonth") WHERE "status" <> 'voided'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "payslips_org_number_unique" ON "payslips" ("organizationId", "payslipNumber") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "invoices_org_number_unique" ON "invoices" ("organizationId", "number") WHERE "number" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."invoices_org_number_unique"`);
        await queryRunner.query(`DROP INDEX "public"."payslips_org_number_unique"`);
        await queryRunner.query(`DROP INDEX "public"."invoices_org_group_type_period_unique"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "invoices_org_group_type_period_unique" ON "invoices" ("organizationId", "groupId", "type", "serviceYear", "serviceMonth") `);
        await queryRunner.query(`ALTER TABLE "client_billing_configs" ALTER COLUMN "feeAmount" SET DEFAULT 300.00`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "totalAmount" SET DEFAULT 0.00`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "subTotal" SET DEFAULT 0.00`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "staleReason"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "isStale"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "issuedSnapshot"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "reconciledAt"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "payrollCostAmount"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "reconciliationStatus"`);
        await queryRunner.query(`ALTER TABLE "final_settlements" DROP COLUMN "paymentReference"`);
        await queryRunner.query(`ALTER TABLE "final_settlements" DROP COLUMN "paidAt"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP COLUMN "paymentReference"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP COLUMN "paidAt"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP COLUMN "employerCostTotal"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP COLUMN "employerContributionTotal"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP COLUMN "netTotal"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP COLUMN "deductionsTotal"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP COLUMN "grossTotal"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP COLUMN "finalizeOverrideGuards"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP COLUMN "payDate"`);
        await queryRunner.query(`ALTER TABLE "payslips" DROP COLUMN "employerCostAmount"`);
        await queryRunner.query(`ALTER TABLE "payslips" DROP COLUMN "employerContributionAmount"`);
        await queryRunner.query(`ALTER TABLE "payslips" DROP COLUMN "deductionsAmount"`);
        await queryRunner.query(`DROP INDEX "public"."billing_period_closes_org_period_unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_236d9043c88affc30c220ecdd4"`);
        await queryRunner.query(`DROP TABLE "billing_period_closes"`);
        await queryRunner.query(`DROP INDEX "public"."payroll_cost_snapshots_org_run_unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_917ffe8d77381661dbd013e1bb"`);
        await queryRunner.query(`DROP TABLE "payroll_cost_snapshots"`);
    }

}
