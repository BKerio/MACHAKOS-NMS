-- Unidentified patients are named by sex and running number:
-- "Unknown African Man 3", "Unknown African Woman 4", "Unknown African Person 5"
-- (sex not recorded). Rename the ones still carrying the old "Unknown 3" form.
UPDATE "incidents"
SET "patient_name" = 'Unknown African ' ||
    CASE lower(trim(coalesce("patient_gender", '')))
        WHEN 'male' THEN 'Man'
        WHEN 'female' THEN 'Woman'
        ELSE 'Person'
    END || ' ' || "unknown_seq"
WHERE "patient_unknown" = true
  AND "unknown_seq" IS NOT NULL
  AND "patient_name" = 'Unknown ' || "unknown_seq";
