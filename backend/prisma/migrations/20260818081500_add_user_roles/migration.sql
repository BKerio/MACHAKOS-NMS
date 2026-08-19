-- AlterTable
ALTER TABLE "users" ADD COLUMN     "roles" "Role"[] DEFAULT ARRAY[]::"Role"[];

-- Backfill: every existing user's single role becomes their one-element roles list.
UPDATE "users" SET "roles" = ARRAY["role"] WHERE cardinality("roles") = 0;
