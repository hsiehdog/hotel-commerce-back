ALTER TABLE "property_hours" RENAME TO "property_front_desk_hours";

ALTER TABLE "property_front_desk_hours" RENAME CONSTRAINT "property_hours_pkey" TO "property_front_desk_hours_pkey";
ALTER TABLE "property_front_desk_hours" RENAME CONSTRAINT "property_hours_property_id_fkey" TO "property_front_desk_hours_property_id_fkey";

ALTER INDEX "property_hours_property_id_day_of_week_idx" RENAME TO "property_front_desk_hours_property_id_day_of_week_idx";
