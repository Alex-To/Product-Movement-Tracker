BEGIN;
-- DropIndex
DROP INDEX "delivery_number_key";

-- AlterTable
ALTER TABLE "batch" ADD COLUMN     "product_name_at_receipt" TEXT,
ADD COLUMN     "received_count" DECIMAL(12,3),
ADD COLUMN     "unit_name_at_receipt" TEXT;

-- AlterTable
ALTER TABLE "delivery" ADD COLUMN     "request_hash" TEXT,
ADD COLUMN     "request_id" TEXT,
ADD COLUMN     "supplier_id" TEXT;

-- CreateTable
CREATE TABLE "suppliers" (
    "id_supplier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id_supplier")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key_key" ON "suppliers"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_request_id_key" ON "delivery"("request_id");

-- CreateIndex
CREATE INDEX "delivery_create_date_id_delivery_idx" ON "delivery"("create_date", "id_delivery");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_supplier_id_number_key" ON "delivery"("supplier_id", "number");

-- AddForeignKey
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id_supplier") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

