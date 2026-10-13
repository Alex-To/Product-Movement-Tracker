-- Списание просрочки делает система: у такого движения нет автора и нет заказа
ALTER TABLE "stock_movement" ALTER COLUMN "creater_id" DROP NOT NULL;

-- История стоп-листа: запись не удаляется, а закрывается (closed_at).
-- Открытых записей одного типа у блюда не больше одной — это держат транзакции Serializable
DROP INDEX "stop_list_id_dish_type_key";

ALTER TABLE "stop_list" ADD COLUMN "closed_at" TIMESTAMP(3),
ADD COLUMN "created_at" TIMESTAMP(3);

-- Уже открытые стопы считаем поставленными сейчас; время явно в UTC
UPDATE "stop_list" SET "created_at" = timezone('UTC', now());

ALTER TABLE "stop_list" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "stop_list_id_dish_closed_at_idx" ON "stop_list"("id_dish", "closed_at");

CREATE INDEX "stop_list_closed_at_idx" ON "stop_list"("closed_at");
