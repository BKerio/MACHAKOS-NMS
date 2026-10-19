-- SMS failover: configured gateways back up the active one, and each logged
-- message records which gateway sent it.
ALTER TABLE "sms_gateways" ADD COLUMN "use_as_backup" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "sms_messages" ADD COLUMN "provider" TEXT;
