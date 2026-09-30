-- Mid-case transfer to another ambulance (e.g. mechanical breakdown).
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'HANDED_OVER';

ALTER TABLE "tasks"
    ADD COLUMN "handed_over_at" TIMESTAMP(3),
    ADD COLUMN "handover_reason" TEXT,
    ADD COLUMN "handover_stage" "TaskStatus",
    ADD COLUMN "handover_lat" DOUBLE PRECISION,
    ADD COLUMN "handover_lng" DOUBLE PRECISION,
    ADD COLUMN "handover_by_id" TEXT,
    ADD COLUMN "previous_task_id" TEXT,
    ADD COLUMN "pickup_lat" DOUBLE PRECISION,
    ADD COLUMN "pickup_lng" DOUBLE PRECISION,
    ADD COLUMN "pickup_name" TEXT;

CREATE UNIQUE INDEX "tasks_previous_task_id_key" ON "tasks"("previous_task_id");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_handover_by_id_fkey"
    FOREIGN KEY ("handover_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_previous_task_id_fkey"
    FOREIGN KEY ("previous_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
