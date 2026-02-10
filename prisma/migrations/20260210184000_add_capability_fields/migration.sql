-- AlterTable
ALTER TABLE "property_commerce_config"
ADD COLUMN "enable_text_link" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "enable_transfer_front_desk" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "enable_waitlist" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "web_booking_url" TEXT;
