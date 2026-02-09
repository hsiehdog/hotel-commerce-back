-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "default_currency" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_hours" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_hours_property_id_day_of_week_idx" ON "property_hours"("property_id", "day_of_week");

-- AddForeignKey
ALTER TABLE "property_hours" ADD CONSTRAINT "property_hours_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
