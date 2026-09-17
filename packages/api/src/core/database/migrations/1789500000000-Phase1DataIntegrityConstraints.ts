import { MigrationInterface, QueryRunner } from "typeorm";

// Phase 1 data-integrity batch (TET-183): the database backstops for the
// invariants the services now enforce, plus the columns the fixes introduced.
//
// Generate-only: this migration is NOT run against the hosted database as part
// of the phase — the PR lists it and it is applied deliberately. Every unique
// index has a pre-flight duplicate check that aborts with a clear message
// instead of silently repairing data.
export class Phase1DataIntegrityConstraints1789500000000 implements MigrationInterface {
    name = 'Phase1DataIntegrityConstraints1789500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // --- Pre-flight: abort (never silently fix) when legacy rows violate an
        // invariant the new index would enforce. Resolve the reported duplicates
        // and re-run.
        await queryRunner.query(`DO $$
          DECLARE duplicates integer;
          BEGIN
            SELECT count(*) INTO duplicates FROM (
              SELECT 1 FROM "salary_revisions"
              GROUP BY "organizationId", "employeeId", "validFrom" HAVING count(*) > 1
            ) d;
            IF duplicates > 0 THEN
              RAISE EXCEPTION 'Phase 1 migration aborted: % duplicate (organizationId, employeeId, validFrom) group(s) in salary_revisions. Resolve them and re-run.', duplicates;
            END IF;

            SELECT count(*) INTO duplicates FROM (
              SELECT 1 FROM "employee_tax_profiles"
              WHERE "validTo" IS NULL
              GROUP BY "organizationId", "employeeId" HAVING count(*) > 1
            ) d;
            IF duplicates > 0 THEN
              RAISE EXCEPTION 'Phase 1 migration aborted: % employee(s) with more than one open tax profile. Close the extra ranges and re-run.', duplicates;
            END IF;

            SELECT count(*) INTO duplicates FROM (
              SELECT 1 FROM "employee_leave_entitlements"
              WHERE "validTo" IS NULL
              GROUP BY "organizationId", "employeeId", "leaveTypeId" HAVING count(*) > 1
            ) d;
            IF duplicates > 0 THEN
              RAISE EXCEPTION 'Phase 1 migration aborted: % open leave-entitlement group(s) per (organizationId, employeeId, leaveTypeId). Close the extra ranges and re-run.', duplicates;
            END IF;

            SELECT count(*) INTO duplicates FROM (
              SELECT 1 FROM "exchange_rates"
              GROUP BY "organizationId", "baseCurrency", "quoteCurrency", "validFrom" HAVING count(*) > 1
            ) d;
            IF duplicates > 0 THEN
              RAISE EXCEPTION 'Phase 1 migration aborted: % duplicate exchange-rate group(s) per (organizationId, baseCurrency, quoteCurrency, validFrom). Resolve them and re-run.', duplicates;
            END IF;

            SELECT count(*) INTO duplicates FROM (
              SELECT 1 FROM "assignments"
              WHERE "validTo" IS NULL AND "isPrimary"
              GROUP BY "organizationId", "employeeId" HAVING count(*) > 1
            ) d;
            IF duplicates > 0 THEN
              RAISE EXCEPTION 'Phase 1 migration aborted: % employee(s) with more than one open primary assignment. End the extras and re-run.', duplicates;
            END IF;
          END $$`);

        // --- Columns introduced by the Phase 1 fixes.
        // D2: the per-calendar-year split a cross-year leave request reserved.
        await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "yearAllocations" jsonb NOT NULL DEFAULT '[]'`);
        // P1.11: the timesheet that froze the entry when its period locked.
        await queryRunner.query(`ALTER TABLE "time_entries" ADD COLUMN "timesheetId" uuid`);
        await queryRunner.query(`CREATE INDEX "time_entries_org_employee_timesheet_idx" ON "time_entries" ("organizationId", "employeeId", "timesheetId")`);

        // --- Invariant backstops (P1.4, P1.11, P5.1 slice).
        await queryRunner.query(`CREATE UNIQUE INDEX "salary_revisions_org_employee_valid_from_unique" ON "salary_revisions" ("organizationId", "employeeId", "validFrom")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "employee_tax_profiles_org_employee_open_unique" ON "employee_tax_profiles" ("organizationId", "employeeId") WHERE "validTo" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "employee_leave_entitlements_open_unique" ON "employee_leave_entitlements" ("organizationId", "employeeId", "leaveTypeId") WHERE "validTo" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "exchange_rates_org_pair_valid_from_unique" ON "exchange_rates" ("organizationId", "baseCurrency", "quoteCurrency", "validFrom")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "assignments_org_employee_open_primary_unique" ON "assignments" ("organizationId", "employeeId") WHERE "validTo" IS NULL AND "isPrimary"`);

        // --- D4: the unused Regularization entity and table are gone.
        await queryRunner.query(`DROP TABLE IF EXISTS "regularizations"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Recreate the removed table exactly as the initial schema had it.
        await queryRunner.query(`CREATE TABLE "regularizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "employeeId" uuid NOT NULL, "date" date NOT NULL, "requestedHours" numeric(5,2) NOT NULL, "reason" character varying(300) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', CONSTRAINT "PK_regularizations" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_regularizations_org_employee_date" ON "regularizations" ("organizationId", "employeeId", "date")`);

        await queryRunner.query(`DROP INDEX "assignments_org_employee_open_primary_unique"`);
        await queryRunner.query(`DROP INDEX "exchange_rates_org_pair_valid_from_unique"`);
        await queryRunner.query(`DROP INDEX "employee_leave_entitlements_open_unique"`);
        await queryRunner.query(`DROP INDEX "employee_tax_profiles_org_employee_open_unique"`);
        await queryRunner.query(`DROP INDEX "salary_revisions_org_employee_valid_from_unique"`);
        await queryRunner.query(`DROP INDEX "time_entries_org_employee_timesheet_idx"`);
        await queryRunner.query(`ALTER TABLE "time_entries" DROP COLUMN "timesheetId"`);
        await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "yearAllocations"`);
    }

}