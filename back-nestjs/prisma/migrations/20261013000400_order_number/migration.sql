-- Номер заказа для кухни хранится в заказе (сквозной круг 1…99), а не вычисляется при каждом показе
ALTER TABLE "orders" ADD COLUMN "number" INTEGER;

-- Уже существующим заказам — те же номера, что кухня показывала раньше:
-- порядковый номер по времени создания по кругу 1…99
UPDATE "orders" AS o
SET "number" = ((n.position - 1) % 99) + 1
FROM (
    SELECT "id_order", row_number() OVER (ORDER BY "create_date", "id_order") AS position
    FROM "orders"
) AS n
WHERE n."id_order" = o."id_order";

ALTER TABLE "orders" ALTER COLUMN "number" SET NOT NULL;

CREATE INDEX "orders_create_date_id_order_idx" ON "orders"("create_date", "id_order");
