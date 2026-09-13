-- CreateTable
CREATE TABLE "push_gateways" (
    "id" TEXT NOT NULL,
    "configEnc" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "push_gateways_pkey" PRIMARY KEY ("id")
);
