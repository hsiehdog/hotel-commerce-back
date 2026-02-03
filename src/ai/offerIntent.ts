export type OfferIntent = {
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  adults: number | null;
  rooms: number | null;
  children: number | null;
  pet_friendly: boolean | null;
  accessible_room: boolean | null;
  needs_two_beds: boolean | null;
  budget_cap: number | null;
  parking_needed: boolean | null;
  language: string | null;
  property_timezone: string;
};

export type PendingAction =
  | {
      type: "clarification";
      missingFields: string[];
      prompt: string;
    }
  | null;

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
  budget_cap: null,
  parking_needed: null,
  language: null,
  property_timezone: timezone,
});
