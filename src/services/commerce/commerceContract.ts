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
  roomType: { id: string; name: string; description?: string; features?: string[] };
  ratePlan: { id: string; name: string };
  policy: {
    refundability: "refundable" | "non_refundable";
    paymentTiming: "pay_at_property" | "pay_now";
    cancellationSummary: string;
  };
  pricing:
    | {
        basis: "afterTax" | "beforeTaxPlusTaxes";
        total: number;
        totalAfterTax: number;
        breakdown?: {
          baseRateSubtotal: number | null;
          taxesAndFees: number | null;
          includedFees: {
            nights: number;
            petFeePerNight: number | null;
            parkingFeePerNight: number | null;
            petFeeTotal: number | null;
            parkingFeeTotal: number | null;
            totalIncludedFees: number | null;
          };
        };
      }
    | {
        basis: "beforeTax";
        total: number;
        breakdown?: {
          baseRateSubtotal: number | null;
          taxesAndFees: number | null;
          includedFees: {
            nights: number;
            petFeePerNight: number | null;
            parkingFeePerNight: number | null;
            petFeeTotal: number | null;
            parkingFeeTotal: number | null;
            totalIncludedFees: number | null;
          };
        };
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
  disclosures?: string[];
};

export type CommerceFallbackAction = {
  type: "suggest_alternate_dates" | "text_booking_link" | "transfer_to_front_desk" | "collect_waitlist" | "contact_property";
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
  propertyId: string;
  channel: "voice" | "web" | "agent";
  currency: string;
  priceBasisUsed: "afterTax" | "beforeTaxPlusTaxes" | "beforeTax";
  offers: CommerceOffer[];
  fallbackAction?: CommerceFallbackAction;
  presentationHints: CommercePresentationHints;
  reasonCodes: string[];
  configVersion: number;
  debug?: {
    resolvedRequest: {
      propertyId: string;
      channel: "voice" | "web" | "agent";
      checkIn: string;
      checkOut: string;
      rooms: number;
      roomOccupancies: Array<{ adults: number; children: number }>;
      currency: string;
      strategyMode: "balanced" | "protect_rate" | "fill_rooms";
      petFriendly?: boolean;
      accessibleRoom?: boolean;
      needsTwoBeds?: boolean;
      budgetCap?: number;
      parkingNeeded?: boolean;
    };
    profilePreAri: {
      tripType: string;
      decisionPosture: string;
      leadTimeDays: number;
      nights: number;
    };
    profileFinal: {
      inventoryState: string;
    };
    selectionSummary: {
      primaryArchetype: "SAFE" | "SAVER" | "OTHER" | null;
      saverPrimaryExceptionApplied: boolean;
      exceptionReason?: {
        lowInventory: boolean;
        roomsAvailable?: number;
        deltaPercent: number;
      };
      secondaryAttempted: boolean;
      secondaryFailureReason: "SECONDARY_POOL_EMPTY_OPPOSITE_ARCHETYPE" | "SECONDARY_REJECTED_PRICE_SPREAD_GUARDRAIL" | null;
    };
    reasonCodes: string[];
    topCandidates: Array<{
      roomTypeId: string;
      roomTypeName: string;
      roomTypeDescription?: string;
      features?: string[];
      isAccessible?: boolean;
      ratePlanId: string;
      roomsAvailable?: number;
      riskContributors: Array<"NON_REFUNDABLE" | "PAY_NOW" | "LOW_INVENTORY">;
      basis: "afterTax" | "beforeTaxPlusTaxes" | "beforeTax";
      totalPrice: number;
      archetype: "SAFE" | "SAVER" | "OTHER";
      scoreTotal: number;
      components: {
        valueScore: number;
        conversionScore: number;
        experienceScore: number;
        riskScore: number;
        marginProxyScore: number;
      };
    }>;
  };
};
