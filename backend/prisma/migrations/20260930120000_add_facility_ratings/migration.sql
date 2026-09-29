-- Crew ratings of the receiving facility, one per crew member per case.
CREATE TABLE "facility_ratings" (
    "id" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "task_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "facility_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "facility_ratings_stars_check" CHECK ("stars" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "facility_ratings_task_id_user_id_key" ON "facility_ratings"("task_id", "user_id");
CREATE INDEX "facility_ratings_facility_id_idx" ON "facility_ratings"("facility_id");

ALTER TABLE "facility_ratings" ADD CONSTRAINT "facility_ratings_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facility_ratings" ADD CONSTRAINT "facility_ratings_facility_id_fkey"
    FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facility_ratings" ADD CONSTRAINT "facility_ratings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
