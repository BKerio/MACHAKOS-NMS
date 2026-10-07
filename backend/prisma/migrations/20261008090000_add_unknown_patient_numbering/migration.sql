-- Unidentified patients get a running label ("Unknown 1", "Unknown 2", ...) and
-- can be identified later without losing that label.
CREATE SEQUENCE "incidents_unknown_seq" START 1;

ALTER TABLE "incidents"
    ADD COLUMN "unknown_seq" INTEGER,
    ADD COLUMN "identified_at" TIMESTAMP(3),
    ADD COLUMN "identified_by_id" TEXT;

CREATE UNIQUE INDEX "incidents_unknown_seq_key" ON "incidents"("unknown_seq");

-- Number the unknown patients logged so far, oldest first, then carry on from there.
WITH ordered AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "case_seq") AS n
    FROM "incidents"
    WHERE "patient_unknown" = true
)
UPDATE "incidents" i SET "unknown_seq" = o.n FROM ordered o WHERE i."id" = o."id";

SELECT setval('incidents_unknown_seq', COALESCE((SELECT MAX("unknown_seq") FROM "incidents"), 0) + 1, false);

-- Their placeholder name follows the label (was "John Doe" / "Jane Doe").
UPDATE "incidents" SET "patient_name" = 'Unknown ' || "unknown_seq"
WHERE "patient_unknown" = true AND "unknown_seq" IS NOT NULL;
