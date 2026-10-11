-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN');

-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('WRITE_OFF');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'WAITER',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id_unit" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id_unit")
);

-- CreateTable
CREATE TABLE "products" (
    "id_product" TEXT NOT NULL,
    "name_product" TEXT NOT NULL,
    "id_unit" TEXT NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id_product")
);

-- CreateTable
CREATE TABLE "delivery" (
    "id_delivery" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "create_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creater_id" TEXT NOT NULL,

    CONSTRAINT "delivery_pkey" PRIMARY KEY ("id_delivery")
);

-- CreateTable
CREATE TABLE "batch" (
    "id_batch" TEXT NOT NULL,
    "count" DECIMAL(12,3) NOT NULL,
    "exp" TIMESTAMP(3) NOT NULL,
    "id_product" TEXT NOT NULL,
    "id_delivery" TEXT NOT NULL,

    CONSTRAINT "batch_pkey" PRIMARY KEY ("id_batch")
);

-- CreateTable
CREATE TABLE "orders" (
    "id_order" TEXT NOT NULL,
    "create_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creater_id" TEXT NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id_order")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id_order_item" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "id_order" TEXT NOT NULL,
    "id_dish" TEXT NOT NULL,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id_order_item")
);

-- CreateTable
CREATE TABLE "dishes" (
    "id_dish" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "dishes_pkey" PRIMARY KEY ("id_dish")
);

-- CreateTable
CREATE TABLE "dish_ingredients" (
    "id_dish_ingredient" TEXT NOT NULL,
    "count" DECIMAL(12,3) NOT NULL,
    "id_dish" TEXT NOT NULL,
    "id_product" TEXT NOT NULL,

    CONSTRAINT "dish_ingredients_pkey" PRIMARY KEY ("id_dish_ingredient")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id_stock_movement" TEXT NOT NULL,
    "count" DECIMAL(12,3) NOT NULL,
    "create_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_batch" TEXT NOT NULL,
    "id_order" TEXT,
    "creater_id" TEXT NOT NULL,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id_stock_movement")
);

-- CreateTable
CREATE TABLE "messages" (
    "id_message" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "create_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "id_recipient" TEXT NOT NULL,
    "id_stock_movement" TEXT,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id_message")
);

-- CreateTable
CREATE TABLE "stop_list" (
    "id_stop_list" TEXT NOT NULL,
    "type" "StopType" NOT NULL,
    "id_dish" TEXT NOT NULL,
    "creater_id" TEXT,

    CONSTRAINT "stop_list_pkey" PRIMARY KEY ("id_stop_list")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_number_key" ON "delivery"("number");

-- CreateIndex
CREATE INDEX "batch_id_product_exp_idx" ON "batch"("id_product", "exp");

-- CreateIndex
CREATE UNIQUE INDEX "dish_ingredients_id_dish_id_product_key" ON "dish_ingredients"("id_dish", "id_product");

-- CreateIndex
CREATE INDEX "messages_id_recipient_is_read_idx" ON "messages"("id_recipient", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "stop_list_id_dish_type_key" ON "stop_list"("id_dish", "type");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_id_unit_fkey" FOREIGN KEY ("id_unit") REFERENCES "units"("id_unit") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_creater_id_fkey" FOREIGN KEY ("creater_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch" ADD CONSTRAINT "batch_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch" ADD CONSTRAINT "batch_id_delivery_fkey" FOREIGN KEY ("id_delivery") REFERENCES "delivery"("id_delivery") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_creater_id_fkey" FOREIGN KEY ("creater_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_id_order_fkey" FOREIGN KEY ("id_order") REFERENCES "orders"("id_order") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_id_dish_fkey" FOREIGN KEY ("id_dish") REFERENCES "dishes"("id_dish") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_id_dish_fkey" FOREIGN KEY ("id_dish") REFERENCES "dishes"("id_dish") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_id_batch_fkey" FOREIGN KEY ("id_batch") REFERENCES "batch"("id_batch") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_id_order_fkey" FOREIGN KEY ("id_order") REFERENCES "orders"("id_order") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_creater_id_fkey" FOREIGN KEY ("creater_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_id_recipient_fkey" FOREIGN KEY ("id_recipient") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_id_stock_movement_fkey" FOREIGN KEY ("id_stock_movement") REFERENCES "stock_movement"("id_stock_movement") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stop_list" ADD CONSTRAINT "stop_list_id_dish_fkey" FOREIGN KEY ("id_dish") REFERENCES "dishes"("id_dish") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stop_list" ADD CONSTRAINT "stop_list_creater_id_fkey" FOREIGN KEY ("creater_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
