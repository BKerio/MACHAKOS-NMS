-- CreateEnum
CREATE TYPE "SmsProvider" AS ENUM ('ADVANTA', 'AFRICAS_TALKING', 'TWILIO');

-- CreateTable
CREATE TABLE "sms_gateways" (
    "id" TEXT NOT NULL,
    "provider" "SmsProvider" NOT NULL,
    "configEnc" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "sms_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_gateways_provider_key" ON "sms_gateways"("provider");
