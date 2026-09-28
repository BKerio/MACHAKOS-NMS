-- CreateEnum
CREATE TYPE "CheckInLocationMatch" AS ENUM ('MATCHED', 'MISMATCH', 'UNVERIFIED');

-- AlterTable
ALTER TABLE "check_ins" ADD COLUMN     "accuracy_m" DOUBLE PRECISION,
ADD COLUMN     "distance_m" INTEGER,
ADD COLUMN     "location_match" "CheckInLocationMatch" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "mock_location" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vehicle_fix_at" TIMESTAMP(3),
ADD COLUMN     "vehicle_lat" DOUBLE PRECISION,
ADD COLUMN     "vehicle_lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "tracker_at" TIMESTAMP(3),
ADD COLUMN     "tracker_lat" DOUBLE PRECISION,
ADD COLUMN     "tracker_lng" DOUBLE PRECISION;
