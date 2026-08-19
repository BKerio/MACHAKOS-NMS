-- CreateTable
CREATE TABLE "inventory_checkouts" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "returned_quantity" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'CHECKED_OUT',
    "checked_out_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_at" TIMESTAMP(3),
    "item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,

    CONSTRAINT "inventory_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_checkouts_item_id_idx" ON "inventory_checkouts"("item_id");

-- CreateIndex
CREATE INDEX "inventory_checkouts_user_id_idx" ON "inventory_checkouts"("user_id");

-- CreateIndex
CREATE INDEX "inventory_checkouts_vehicle_id_idx" ON "inventory_checkouts"("vehicle_id");

-- CreateIndex
CREATE INDEX "inventory_checkouts_status_idx" ON "inventory_checkouts"("status");

-- AddForeignKey
ALTER TABLE "inventory_checkouts" ADD CONSTRAINT "inventory_checkouts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_checkouts" ADD CONSTRAINT "inventory_checkouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_checkouts" ADD CONSTRAINT "inventory_checkouts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
