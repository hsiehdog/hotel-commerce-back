-- AlterTable
ALTER TABLE "properties"
ADD COLUMN "pms_provider" TEXT,
ADD COLUMN "pms_property_id" TEXT,
ADD COLUMN "name" TEXT,
ADD COLUMN "address_line1" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "postal_code" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "properties_pms_provider_pms_property_id_key" ON "properties"("pms_provider", "pms_property_id");

-- CreateEnum
CREATE TYPE "CancellationPenaltyType" AS ENUM ('FIRST_NIGHT_PLUS_TAX', 'PERCENT_OF_STAY');

-- CreateTable
CREATE TABLE "property_content" (
    "property_id" TEXT NOT NULL,
    "overview_marketing" TEXT,
    "neighborhood_highlights" JSONB,
    "vibe_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_content_pkey" PRIMARY KEY ("property_id")
);

-- CreateTable
CREATE TABLE "property_amenities" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "details_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_stay_policies" (
    "property_id" TEXT NOT NULL,
    "check_in_time" TEXT,
    "check_out_time" TEXT,
    "late_checkout_time" TEXT,
    "late_checkout_fee_cents" INTEGER,
    "late_checkout_currency" TEXT,
    "after_hours_arrival_cutoff" TEXT,
    "after_hours_arrival_instructions" TEXT,
    "smoking_penalty_cents" INTEGER,
    "smoking_penalty_currency" TEXT,
    "pet_fee_per_night_cents" INTEGER,
    "pet_fee_currency" TEXT,
    "pet_policy_requires_note_at_booking" BOOLEAN NOT NULL DEFAULT false,
    "dog_friendly_rooms_limited" BOOLEAN NOT NULL DEFAULT false,
    "id_required" BOOLEAN NOT NULL DEFAULT true,
    "credit_card_required" BOOLEAN NOT NULL DEFAULT true,
    "terms_text" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_stay_policies_pkey" PRIMARY KEY ("property_id")
);

-- CreateTable
CREATE TABLE "property_cancellation_policies" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "applies_to_room_type_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "effective_start_month_day" TEXT,
    "effective_end_month_day" TEXT,
    "free_cancel_days_before" INTEGER NOT NULL,
    "free_cancel_cutoff_time" TEXT NOT NULL,
    "penalty_type" "CancellationPenaltyType" NOT NULL,
    "penalty_value" INTEGER,
    "charge_hours_before_arrival" INTEGER,
    "policy_text_long" TEXT,
    "policy_summary_template" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_cancellation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_amenities_property_id_key_key" ON "property_amenities"("property_id", "key");
CREATE INDEX "property_cancellation_policies_property_id_priority_idx" ON "property_cancellation_policies"("property_id", "priority");

-- AddForeignKey
ALTER TABLE "property_content" ADD CONSTRAINT "property_content_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_stay_policies" ADD CONSTRAINT "property_stay_policies_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_cancellation_policies" ADD CONSTRAINT "property_cancellation_policies_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
