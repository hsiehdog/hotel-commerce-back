export type StrategyMode = "balanced" | "protect_rate" | "fill_rooms";
export type DecisionPosture = "certainty" | "price" | "experience" | "urgent";
export type TripType = "family" | "business" | "couple" | "solo" | "group_lite";
export type InventoryState = "low" | "normal" | "unknown";

export type CommerceProfile = {
  tripType: TripType;
  decisionPosture: DecisionPosture;
  inventoryState: InventoryState;
  leadTimeDays: number;
  nights: number;
};

export type ChannelType = "voice" | "web" | "agent";

export type ChannelCapabilities = {
  canTextLink: boolean;
  canTransferToFrontDesk: boolean;
  canCollectWaitlist: boolean;
  hasWebBookingUrl: boolean;
};

export type OfferGenerateRequestV1 = {
  property_id?: string;
  channel?: ChannelType;
  check_in?: string;
  check_out?: string;
  nights?: number;
  currency?: string;
  rooms?: number;
  roomOccupancies?: Array<{ adults: number; children: number; childAges?: number[] }>;
  adults?: number;
  children?: number;
  child_ages?: number[];
  preferences?: {
    needs_space?: boolean;
    late_arrival?: boolean;
  };
  stub_scenario?: string;
  debug?: boolean;
};

export type NormalizedOfferRequest = {
  propertyId: string;
  channel: ChannelType;
  checkIn: string;
  checkOut: string;
  currency: string;
  rooms: number;
  roomOccupancies: Array<{ adults: number; children: number; childAges?: number[] }>;
  totalAdults: number;
  totalChildren: number;
  childAges?: number[];
  nowUtcIso: string;
  nights: number;
  leadTimeDays: number;
  strategyMode: StrategyMode;
  capabilities: ChannelCapabilities;
  isOpenNow: boolean;
  profile: CommerceProfile;
  preferences?: {
    needs_space?: boolean;
    late_arrival?: boolean;
  };
  stubScenario?: string;
  configVersion: number;
  urgencyEnabled: boolean;
  allowedUrgencyTypes: string[];
  debug: boolean;
  occupancyDistributed: boolean;
};

export type Candidate = {
  roomTypeId: string;
  roomTypeName: string;
  roomTypeDescription?: string;
  features?: string[];
  roomsAvailable?: number;
  maxOccupancy?: number;
  roomTier: "standard" | "deluxe" | "suite";
  ratePlanId: string;
  ratePlanName: string;
  currency: string;
  price: {
    amount: number;
    basis: "afterTax" | "beforeTaxPlusTaxes" | "beforeTax";
    nightly?: Array<{ date: string; amount: number }>;
  };
  refundability: "refundable" | "non_refundable" | "unknown";
  paymentTiming: "pay_now" | "pay_at_property" | "unknown";
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  minLengthOfStay?: number;
  maxLengthOfStay?: number;
};

export type ScoredCandidate = Candidate & {
  scoreTotal: number;
  componentScores: {
    valueScore: number;
    conversionScore: number;
    experienceScore: number;
    riskScore: number;
    marginProxyScore: number;
  };
  archetype: "SAFE" | "SAVER" | "OTHER";
};
