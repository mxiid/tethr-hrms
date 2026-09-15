import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase2ExpenseClaims1789401743045 implements MigrationInterface {
    name = 'Phase2ExpenseClaims1789401743045'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "expense_claims" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "employeeId" uuid NOT NULL, "claimNumber" character varying(32), "purpose" character varying(300) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'draft', "currency" character varying(3) NOT NULL DEFAULT 'PKR', "totalAmount" numeric(14,2) NOT NULL DEFAULT '0', "billableAmount" numeric(14,2) NOT NULL DEFAULT '0', "submittedAt" TIMESTAMP WITH TIME ZONE, "approvalRequestId" uuid, "decidedByUserId" uuid, "decidedAt" TIMESTAMP WITH TIME ZONE, "decisionNote" character varying(300), "reimbursementMethod" character varying(16), "reimbursedAt" TIMESTAMP WITH TIME ZONE, "reimbursementReference" character varying(120), "payrollAdjustmentId" uuid, "reimbursementPeriodYear" integer, "reimbursementPeriodMonth" integer, "billedInvoiceId" uuid, "billedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_df3bf7ea3a3a31e39525a322ef6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ff249413eee2701b50dfea5f47" ON "expense_claims" ("organizationId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "expense_claims_org_number_unique" ON "expense_claims" ("organizationId", "claimNumber") WHERE "claimNumber" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_07b0541de38f523eb0b90345a7" ON "expense_claims" ("organizationId", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_98529874c550dd7c01af861743" ON "expense_claims" ("organizationId", "employeeId") `);
        await queryRunner.query(`CREATE TABLE "expense_claim_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "claimId" uuid NOT NULL, "categoryId" uuid NOT NULL, "expenseDate" date NOT NULL, "description" character varying(200) NOT NULL, "amount" numeric(14,2) NOT NULL, "receiptStorageKey" character varying(400), "receiptFileName" character varying(255), "receiptContentType" character varying(120), "receiptSizeBytes" bigint, CONSTRAINT "PK_96bd5cd007eede3d13f75cce993" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d7ded2112ec586738e012d9040" ON "expense_claim_lines" ("organizationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_888e22851f187c708b1e928247" ON "expense_claim_lines" ("organizationId", "claimId") `);
        await queryRunner.query(`CREATE TABLE "expense_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "code" character varying(32) NOT NULL, "name" character varying(120) NOT NULL, "description" character varying(300), "requiresReceipt" boolean NOT NULL DEFAULT false, "billableToClient" boolean NOT NULL DEFAULT false, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_d0ef31e189d9523461215b62775" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8a814a29bf0799434e07c3e566" ON "expense_categories" ("organizationId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "expense_categories_org_code_unique" ON "expense_categories" ("organizationId", "code") `);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "subTotal" SET DEFAULT '0.00'`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "totalAmount" SET DEFAULT '0.00'`);
        await queryRunner.query(`ALTER TABLE "client_billing_configs" ALTER COLUMN "feeAmount" SET DEFAULT '300.00'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_billing_configs" ALTER COLUMN "feeAmount" SET DEFAULT 300.00`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "totalAmount" SET DEFAULT 0.00`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "subTotal" SET DEFAULT 0.00`);
        await queryRunner.query(`DROP INDEX "public"."expense_categories_org_code_unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8a814a29bf0799434e07c3e566"`);
        await queryRunner.query(`DROP TABLE "expense_categories"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_888e22851f187c708b1e928247"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d7ded2112ec586738e012d9040"`);
        await queryRunner.query(`DROP TABLE "expense_claim_lines"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_98529874c550dd7c01af861743"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_07b0541de38f523eb0b90345a7"`);
        await queryRunner.query(`DROP INDEX "public"."expense_claims_org_number_unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ff249413eee2701b50dfea5f47"`);
        await queryRunner.query(`DROP TABLE "expense_claims"`);
    }

}
