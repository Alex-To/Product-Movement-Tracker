-- Настройки ресторана: одна строка с id = 1, значения по умолчанию утверждены
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "cook_reserve_minutes" INTEGER NOT NULL DEFAULT 30,
    "urgent_percent" INTEGER NOT NULL DEFAULT 25,
    "urgent_min_hours" INTEGER NOT NULL DEFAULT 24,
    "urgent_max_hours" INTEGER NOT NULL DEFAULT 168,
    "hot_limit" INTEGER NOT NULL DEFAULT 3,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "settings_single_row" CHECK ("id" = 1)
);

-- Время явно в UTC: столбец без часового пояса, а значение по умолчанию взяло бы местное время сервера БД
INSERT INTO "settings" ("id", "updated_at") VALUES (1, timezone('UTC', now()));
