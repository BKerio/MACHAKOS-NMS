-- Fingerprint sign-in for field crew: one device key per phone it's enabled on.
CREATE TABLE "biometric_keys" (
    "id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "device_name" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "biometric_keys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "biometric_keys_user_id_idx" ON "biometric_keys"("user_id");

ALTER TABLE "biometric_keys" ADD CONSTRAINT "biometric_keys_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
