-- Период, за который считается спрос на блюдо для горячих предложений (по умолчанию 7 дней)
ALTER TABLE "settings" ADD COLUMN "demand_days" INTEGER NOT NULL DEFAULT 7;
