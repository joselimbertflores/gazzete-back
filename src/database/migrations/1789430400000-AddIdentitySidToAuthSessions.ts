import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdentitySidToAuthSessions1789430400000 implements MigrationInterface {
  name = 'AddIdentitySidToAuthSessions1789430400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "auth_sessions"`);
    await queryRunner.query(`ALTER TABLE "auth_sessions" ADD "identitySid" text NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_auth_sessions_identity_sid" ON "auth_sessions" ("identitySid")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_auth_sessions_identity_sid"`);
    await queryRunner.query(`ALTER TABLE "auth_sessions" DROP COLUMN "identitySid"`);
  }
}
