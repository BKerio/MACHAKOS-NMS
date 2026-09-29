-- Straight-line distances captured on the task itself:
-- accept → live ambulance tracker to the scene
-- patient pickup → scene to the recommended facility
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "distance_to_scene_km" DOUBLE PRECISION;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "scene_to_facility_km" DOUBLE PRECISION;
