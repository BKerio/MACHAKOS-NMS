-- Reasons for an inter-facility referral (checkbox list on intake). The
-- receiving facility is now chosen at dispatch, so it is no longer required
-- when the referral is logged.
ALTER TABLE "incidents"
    ADD COLUMN "referral_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "referral_reason_other" TEXT;
