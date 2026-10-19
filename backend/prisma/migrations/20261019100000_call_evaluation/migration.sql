-- Call quality review: flag calls into a "For evaluation" folder, then score them.
ALTER TABLE "call_logs"
    ADD COLUMN "for_evaluation" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "eval_reason" TEXT,
    ADD COLUMN "eval_flagged_at" TIMESTAMP(3),
    ADD COLUMN "eval_flagged_by" TEXT,
    ADD COLUMN "eval_score" INTEGER,
    ADD COLUMN "eval_notes" TEXT,
    ADD COLUMN "evaluated_at" TIMESTAMP(3),
    ADD COLUMN "evaluated_by" TEXT;

CREATE INDEX "call_logs_for_evaluation_started_at_idx" ON "call_logs"("for_evaluation", "started_at");
