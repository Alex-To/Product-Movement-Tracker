BEGIN;

-- CreateTable
CREATE TABLE "order_item_exclusions" (
    "id_order_item" TEXT NOT NULL,
    "id_product" TEXT NOT NULL,

    CONSTRAINT "order_item_exclusions_pkey" PRIMARY KEY ("id_order_item","id_product")
);

-- AddForeignKey
ALTER TABLE "order_item_exclusions" ADD CONSTRAINT "order_item_exclusions_id_order_item_fkey" FOREIGN KEY ("id_order_item") REFERENCES "order_item"("id_order_item") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_exclusions" ADD CONSTRAINT "order_item_exclusions_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
