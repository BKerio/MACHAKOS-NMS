-- One push token per device (app + web can both receive alerts).
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens"("user_id");

ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over the single token each user had, so nobody loses alerts on deploy.
-- DISTINCT ON keeps one owner if two users somehow share a token.
INSERT INTO "push_tokens" ("id", "token", "platform", "user_id", "created_at", "updated_at")
SELECT DISTINCT ON ("fcm_token") gen_random_uuid()::text, "fcm_token", 'UNKNOWN', "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
WHERE "fcm_token" IS NOT NULL AND "fcm_token" <> ''
ORDER BY "fcm_token", "updated_at" DESC;
