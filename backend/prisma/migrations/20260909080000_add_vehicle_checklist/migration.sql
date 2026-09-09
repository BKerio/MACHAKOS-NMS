-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "item_type" TEXT NOT NULL DEFAULT 'MEDICAL',
ADD COLUMN     "required_for_dispatch" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "checklist_reset_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "vehicle_checklist_checks" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicle_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "checked_by_id" TEXT NOT NULL,

    CONSTRAINT "vehicle_checklist_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_item_type_idx" ON "inventory_items"("item_type");

-- CreateIndex
CREATE INDEX "vehicle_checklist_checks_vehicle_id_idx" ON "vehicle_checklist_checks"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_checklist_checks_vehicle_id_item_id_key" ON "vehicle_checklist_checks"("vehicle_id", "item_id");

-- AddForeignKey
ALTER TABLE "vehicle_checklist_checks" ADD CONSTRAINT "vehicle_checklist_checks_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_checklist_checks" ADD CONSTRAINT "vehicle_checklist_checks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_checklist_checks" ADD CONSTRAINT "vehicle_checklist_checks_checked_by_id_fkey" FOREIGN KEY ("checked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
