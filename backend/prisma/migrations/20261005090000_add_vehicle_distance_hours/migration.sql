-- Hour-by-hour distance driven per ambulance, accumulated by the GPS poller
-- (tracking.service.ts). Plus the previous sample on each vehicle, so each
-- poll can add the leg driven since the last one.
ALTER TABLE "vehicles"
    ADD COLUMN "dist_last_lat" DOUBLE PRECISION,
    ADD COLUMN "dist_last_lng" DOUBLE PRECISION,
    ADD COLUMN "dist_last_at" TIMESTAMP(3),
    ADD COLUMN "dist_last_odometer_km" DOUBLE PRECISION;

CREATE TABLE "vehicle_distance_hours" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "hour_start" TIMESTAMP(3) NOT NULL,
    "distance_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moving_samples" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'GPS',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_distance_hours_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_distance_hours_vehicle_id_hour_start_key" ON "vehicle_distance_hours"("vehicle_id", "hour_start");
CREATE INDEX "vehicle_distance_hours_hour_start_idx" ON "vehicle_distance_hours"("hour_start");

ALTER TABLE "vehicle_distance_hours" ADD CONSTRAINT "vehicle_distance_hours_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
