BEGIN;

-- CreateEnum
CREATE TYPE "ExternalRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExternalLineStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "external_interfaces" (
    "id_external_interface" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "external_interfaces_pkey" PRIMARY KEY ("id_external_interface")
);

-- CreateTable
CREATE TABLE "external_delivery_requests" (
    "id_external_request" TEXT NOT NULL,
    "interface_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_name_at_submission" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ExternalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "request_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "comment" TEXT,
    "decision_hash" TEXT,
    "delivery_id" TEXT,

    CONSTRAINT "external_delivery_requests_pkey" PRIMARY KEY ("id_external_request")
);

-- CreateTable
CREATE TABLE "external_delivery_request_lines" (
    "id_external_request_line" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "unit_id_at_submission" TEXT NOT NULL,
    "product_name_at_submission" TEXT NOT NULL,
    "unit_name_at_submission" TEXT NOT NULL,
    "accepted_quantity" DECIMAL(12,3),
    "status" "ExternalLineStatus" NOT NULL DEFAULT 'PENDING',
    "batch_id" TEXT,

    CONSTRAINT "external_delivery_request_lines_pkey" PRIMARY KEY ("id_external_request_line")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_interfaces_key_hash_key" ON "external_interfaces"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "external_delivery_requests_delivery_id_key" ON "external_delivery_requests"("delivery_id");

-- CreateIndex
CREATE INDEX "external_delivery_requests_status_submitted_at_id_external__idx" ON "external_delivery_requests"("status", "submitted_at", "id_external_request");

-- CreateIndex
CREATE INDEX "external_delivery_requests_interface_id_submitted_at_id_ext_idx" ON "external_delivery_requests"("interface_id", "submitted_at", "id_external_request");

-- CreateIndex
CREATE UNIQUE INDEX "external_delivery_requests_interface_id_request_id_key" ON "external_delivery_requests"("interface_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_delivery_request_lines_batch_id_key" ON "external_delivery_request_lines"("batch_id");

-- CreateIndex
CREATE INDEX "external_delivery_request_lines_product_id_idx" ON "external_delivery_request_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_delivery_request_lines_request_id_position_key" ON "external_delivery_request_lines"("request_id", "position");

-- AddForeignKey
ALTER TABLE "external_interfaces" ADD CONSTRAINT "external_interfaces_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_delivery_requests" ADD CONSTRAINT "external_delivery_requests_interface_id_fkey" FOREIGN KEY ("interface_id") REFERENCES "external_interfaces"("id_external_interface") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_delivery_requests" ADD CONSTRAINT "external_delivery_requests_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id_supplier") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_delivery_requests" ADD CONSTRAINT "external_delivery_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_delivery_requests" ADD CONSTRAINT "external_delivery_requests_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "delivery"("id_delivery") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_delivery_request_lines" ADD CONSTRAINT "external_delivery_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "external_delivery_requests"("id_external_request") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_delivery_request_lines" ADD CONSTRAINT "external_delivery_request_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_delivery_request_lines" ADD CONSTRAINT "external_delivery_request_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batch"("id_batch") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "external_requests_pending_invoice" ON "external_delivery_requests" ("supplier_id", "number") WHERE "status" = 'PENDING';
ALTER TABLE "external_delivery_request_lines" ADD CONSTRAINT "external_line_quantities" CHECK (quantity > 0 AND (accepted_quantity IS NULL OR (accepted_quantity >= 0 AND accepted_quantity <= quantity)));

COMMIT;
