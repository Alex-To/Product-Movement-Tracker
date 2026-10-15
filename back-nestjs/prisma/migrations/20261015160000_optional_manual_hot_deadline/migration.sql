-- Separate an indefinite assignment from an absent one without a new table.
ALTER TABLE "dishes" ADD COLUMN "manual_hot_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Prisma stores DateTime as UTC in TIMESTAMP(3).
UPDATE "dishes"
SET "manual_hot_enabled" = true
WHERE "deleted_at" IS NULL AND "manual_hot_until" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
