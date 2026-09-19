import { MigrationInterface, QueryRunner } from "typeorm";

// Phase 3 session hardening (TET-213): the session epoch every issued JWT
// carries. Bumping it (termination, disable) revokes outstanding tokens on
// their next use; existing tokens minted without the claim read as 0, which is
// the same value the default gives every existing row.
export class Phase3SessionHardening1789760000000 implements MigrationInterface {
    name = 'Phase3SessionHardening1789760000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "tokenVersion" integer NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tokenVersion"`);
    }

}
