export type CloudbedsAriSeedRoomType = {
  roomTypeId: string;
  roomTypeName: string;
  maxOccupancy: number;
  roomsAvailable: number;
  baseRate: number;
};

export const CLOUDBEDS_BASE_ROOM_TYPES: CloudbedsAriSeedRoomType[] = [
  {
    roomTypeId: "RT_KING",
    roomTypeName: "Deluxe King",
    maxOccupancy: 2,
    roomsAvailable: 3,
    baseRate: 175,
  },
  {
    roomTypeId: "RT_QN",
    roomTypeName: "Double Queen",
    maxOccupancy: 4,
    roomsAvailable: 2,
    baseRate: 190,
  },
  {
    roomTypeId: "RT_ACC_KING",
    roomTypeName: "Accessible King",
    maxOccupancy: 2,
    roomsAvailable: 1,
    baseRate: 185,
  },
];

export const CLOUDBEDS_ARI_ASSUMPTIONS = {
  pricingAssumptions:
    "Stubbed ARI pricing: base rates by room type, 12% tax, 15% discount for pay-now.",
  taxRate: 0.12,
  payNowDiscountRate: 0.15,
  nightlyRateIncrement: 5,
  includedAdultCount: 2,
  extraAdultSurcharge: 20,
  childSurcharge: 10,
  petFriendlySurcharge: 25,
  parkingSurcharge: 15,
  budgetCapMultiplier: 0.95,
  minNightlyRate: 80,
  freeCancellationWindowDays: 2,
  minLengthOfStay: 1,
  defaultNights: 1,
} as const;

export const CLOUDBEDS_ARI_RULES = {
  accessibleRoomTypeId: "RT_ACC_KING",
  twoBedsRoomTypeId: "RT_QN",
} as const;

export const CLOUDBEDS_RATE_PLAN_SEEDS = {
  flexible: {
    ratePlanId: "RP_FLEX",
    ratePlanName: "Flexible",
    refundability: "REFUNDABLE",
    paymentTiming: "PAY_AT_HOTEL",
    cancellationType: "FREE_CANCEL",
  },
  payNow: {
    ratePlanId: "RP_PAYNOW",
    ratePlanName: "Pay Now Saver",
    refundability: "NON_REFUNDABLE",
    paymentTiming: "PAY_NOW",
    cancellationType: "NO_REFUND",
  },
} as const;
