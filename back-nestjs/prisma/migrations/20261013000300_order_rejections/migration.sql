-- Журнал отклонённых заказов для менеджера: причина вычисляется сервером
-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('STOP_LIST', 'SHORTAGE', 'BUSY');

-- CreateTable
CREATE TABLE "order_rejections" (
    "id_order_rejection" TEXT NOT NULL,
    "create_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "RejectionReason" NOT NULL,
    "lines" JSONB NOT NULL,
    "details" JSONB NOT NULL,
    "waiter_name" TEXT NOT NULL,
    "waiter_id" TEXT,

    CONSTRAINT "order_rejections_pkey" PRIMARY KEY ("id_order_rejection")
);

-- CreateIndex
CREATE INDEX "order_rejections_create_date_idx" ON "order_rejections"("create_date");

-- AddForeignKey
ALTER TABLE "order_rejections" ADD CONSTRAINT "order_rejections_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

