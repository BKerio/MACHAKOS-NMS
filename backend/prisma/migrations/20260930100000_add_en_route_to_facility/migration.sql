-- New case stage between patient pickup and arrival at the facility.
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'EN_ROUTE_TO_FACILITY' AFTER 'PATIENT_PICKED';

-- When the crew left the scene with the patient (on-scene time = this - scene_arrival_at).
ALTER TABLE "tasks" ADD COLUMN "scene_departure_at" TIMESTAMP(3);
