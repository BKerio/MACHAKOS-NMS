-- Inter-facility referrals (facility A -> facility B) and unidentified patients.
CREATE TYPE "IncidentType" AS ENUM ('EMERGENCY', 'REFERRAL');

ALTER TABLE "incidents"
    ADD COLUMN "incident_type" "IncidentType" NOT NULL DEFAULT 'EMERGENCY',
    ADD COLUMN "origin_facility_id" TEXT,
    ADD COLUMN "patient_unknown" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "patient_description" TEXT;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_origin_facility_id_fkey"
    FOREIGN KEY ("origin_facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "incidents_origin_facility_id_idx" ON "incidents"("origin_facility_id");
