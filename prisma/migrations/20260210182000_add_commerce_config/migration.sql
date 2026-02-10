-- CreateTable
CREATE TABLE "property_commerce_config" (
    "property_id" TEXT NOT NULL,
    "strategy_mode" TEXT NOT NULL DEFAULT 'balanced',
    "upsell_posture" TEXT,
    "cancellation_sensitivity" TEXT,
    "urgency_enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowed_urgency_types" TEXT,
    "default_currency" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_commerce_config_pkey" PRIMARY KEY ("property_id")
);

-- CreateTable
CREATE TABLE "room_tier_overrides" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "room_type_id" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_tier_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_tier_overrides_property_id_room_type_id_key" ON "room_tier_overrides"("property_id", "room_type_id");

-- AddForeignKey
ALTER TABLE "property_commerce_config" ADD CONSTRAINT "property_commerce_config_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_tier_overrides" ADD CONSTRAINT "room_tier_overrides_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
