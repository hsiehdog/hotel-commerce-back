import type { OfferSlots } from "../offers/offerSchema";

export type OfferIntent = {
  [K in keyof OfferSlots]: OfferSlots[K] | null;
} & {
  language: string | null;
  property_timezone: string;
  confirmation_pending: boolean;
};

export const createEmptyOfferIntent = (timezone = "America/Los_Angeles"): OfferIntent => ({
  check_in: null,
  check_out: null,
  nights: null,
  adults: null,
  rooms: 1,
  children: 0,
  pet_friendly: null,
  accessible_room: null,
  needs_two_beds: null,
  parking_needed: null,
  stub_scenario: null,
  language: null,
  property_timezone: timezone,
  confirmation_pending: false,
});
