export type CommerceEnhancement = {
  id: string;
  name: string;
  price: {
    type: "perNight" | "perStay" | "perPersonPerNight" | "perPersonPerStay";
    amount: number;
    currency: string;
  };
  availability: "guaranteed" | "request" | "info";
  whyShown: string;
  disclosure?: string;
};

export type CommerceOffer = {
  offerId: string;
  type: "SAFE" | "SAVER";
  recommended: boolean;
  roomType: { id: string; name: string };
  ratePlan: { id: string; name: string };
  policy: {
    refundability: "refundable" | "non_refundable";
    paymentTiming: "pay_at_property" | "pay_now";
    cancellationSummary: string;
  };
  pricing: {
    totalAfterTax: number;
  };
  urgency?: {
    type: "scarcity_rooms";
    value: number;
    source: {
      roomTypeId: string;
      field: "roomsAvailable";
    };
  } | null;
  enhancements?: CommerceEnhancement[];
};

export type CommerceFallbackAction = {
  type: "suggest_alternate_dates" | "text_booking_link" | "transfer_to_front_desk" | "collect_waitlist";
  reason: string;
  suggestions?: Array<{ check_in: string; check_out: string }>;
  requiresCapabilities?: string[];
};

export type CommercePresentationHints = {
  emphasis: string[];
  urgency:
    | {
        type: "scarcity_rooms";
        value: number;
        source: { roomTypeId: string; field: "roomsAvailable" };
      }
    | null;
};

export type CommerceOfferResponse = {
  currency: string;
  priceBasisUsed: "afterTax" | "beforeTaxPlusTaxes" | "beforeTax";
  offers: CommerceOffer[];
  fallbackAction?: CommerceFallbackAction;
  presentationHints: CommercePresentationHints;
  decisionTrace: string[];
};
