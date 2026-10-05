-- Public vs private ownership for each facility (System Report, Facilities registry).
CREATE TYPE "FacilityOwnership" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "facilities"
    ADD COLUMN "ownership" "FacilityOwnership" NOT NULL DEFAULT 'PUBLIC';

-- Backfill from the free-text type, which is the only place ownership was
-- recorded until now (e.g. "Private Hospital").
UPDATE "facilities" SET "ownership" = 'PRIVATE' WHERE "type" ILIKE '%private%';
