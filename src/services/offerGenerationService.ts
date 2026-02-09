import { createEmptyOfferIntent, type OfferIntent } from "../ai/offerIntent";
import { buildSlotSpeech, buildOffersFromSnapshot, resolveOfferSlots, type OfferOption } from "../ai/getOffersTool";
import { getAriRaw } from "../integrations/cloudbeds/cloudbedsClient";
import { normalizeAriRawToSnapshot } from "../integrations/cloudbeds/cloudbedsNormalizer";

export type GenerateOffersInput = {
  args: unknown;
  currentIntent?: OfferIntent;
  now?: Date;
};

export type OfferGenerationOutput =
  | {
      status: "OK";
      slots: OfferIntent;
      offers: OfferOption[];
      message: string;
      speech: string;
    }
  | {
      status: "NEEDS_CLARIFICATION";
      missingFields: string[];
      clarificationPrompt: string;
      slots: OfferIntent;
    };

export const generateOffers = ({ args, currentIntent, now }: GenerateOffersInput): OfferGenerationOutput => {
  const intent = currentIntent ?? createEmptyOfferIntent();
  const result = resolveOfferSlots(intent, args, now);

  if (result.status === "NEEDS_CLARIFICATION") {
    return result;
  }

  const ariRaw = getAriRaw({
    propertyId: "demo_property",
    checkIn: result.slots.check_in ?? "",
    checkOut: result.slots.check_out ?? undefined,
    nights: result.slots.nights ?? undefined,
    adults: result.slots.adults ?? 1,
    rooms: result.slots.rooms ?? 1,
    children: result.slots.children ?? 0,
    pet_friendly: result.slots.pet_friendly ?? undefined,
    accessible_room: result.slots.accessible_room ?? undefined,
    needs_two_beds: result.slots.needs_two_beds ?? undefined,
    parking_needed: result.slots.parking_needed ?? undefined,
    budget_cap: result.slots.budget_cap ?? undefined,
    currency: "USD",
    timezone: result.slots.property_timezone,
  });

  const snapshot = normalizeAriRawToSnapshot(ariRaw);
  if (snapshot.roomTypes.length === 0) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: [],
      clarificationPrompt:
        "I'm not seeing availability for those dates with that many rooms. Would you like to try fewer rooms or different dates?",
      slots: result.slots,
    };
  }

  const offers = buildOffersFromSnapshot(snapshot, result.slots);

  return {
    status: "OK",
    slots: result.slots,
    offers,
    message: "Get offers tool will be called now with the following slots",
    speech: buildSlotSpeech(result.slots, offers),
  };
};
