-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "emt2_id" TEXT,
ADD COLUMN     "nurse2_id" TEXT;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "current_emt2_id" TEXT,
ADD COLUMN     "current_nurse2_id" TEXT;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_emt2_id_fkey" FOREIGN KEY ("emt2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_nurse2_id_fkey" FOREIGN KEY ("nurse2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_emt2_id_fkey" FOREIGN KEY ("current_emt2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_nurse2_id_fkey" FOREIGN KEY ("current_nurse2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
