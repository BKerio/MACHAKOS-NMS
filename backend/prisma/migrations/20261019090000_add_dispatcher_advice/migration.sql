-- First-aid advice the dispatcher gave the caller (recorded alongside the
-- first responder management on intake and on the case page).
ALTER TABLE "incidents"
    ADD COLUMN "dispatcher_advice" TEXT;
