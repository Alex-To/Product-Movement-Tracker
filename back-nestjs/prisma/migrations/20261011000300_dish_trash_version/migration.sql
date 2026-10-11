BEGIN;
ALTER TABLE "dishes" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "dishes_deleted_at_name_idx" ON "dishes"("deleted_at", "name");
COMMIT;
