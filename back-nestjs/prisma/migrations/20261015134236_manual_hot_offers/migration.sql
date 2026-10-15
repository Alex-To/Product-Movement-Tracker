-- Add an optional manual promotion deadline to existing dishes.
ALTER TABLE "dishes" ADD COLUMN "manual_hot_until" TIMESTAMP(3);
