export type CloudbedsAriSeedRoomType = {
  roomTypeId: string;
  roomTypeName: string;
  roomTypeDescription: string;
  features: string[];
  maxOccupancy: number;
  roomsAvailable: number;
  baseRate: number;
};

export const CLOUDBEDS_BASE_ROOM_TYPES: CloudbedsAriSeedRoomType[] = [
  {
    roomTypeId: "RT_KING",
    roomTypeName: "King Room",
    roomTypeDescription:
      "At more than 325 sq ft, each King Room features a sitting area and is non-smoking with complimentary Wi-Fi, renovated shower bathroom, air conditioning, microwave, mini fridge, coffee maker, hair dryer, ceiling fan, and desk.",
    features: [
      "Air-conditioning",
      "Hairdryer",
      "Cribs upon request",
      "Cable television",
      "Wireless internet (WiFi)",
      "Ceiling fan",
      "Coffee maker",
      "Microwave",
      "Mini fridge",
      "Free parking",
    ],
    maxOccupancy: 2,
    roomsAvailable: 3,
    baseRate: 109,
  },
  {
    roomTypeId: "RT_QN",
    roomTypeName: "Two Queen Room",
    roomTypeDescription:
      "At more than 325 sq ft, each Two Queen Room features two queen beds and a private bathroom with tub. Rooms are non-smoking and include Wi-Fi, air conditioning, microwave, mini fridge, coffee maker, hair dryer, ceiling fan, and desk.",
    features: [
      "Ceiling fan",
      "Air-conditioning",
      "Coffee maker",
      "Wireless internet (WiFi)",
      "Cribs upon request",
      "Cable television",
      "Hairdryer",
      "Microwave",
      "Free parking",
      "Mini fridge",
    ],
    maxOccupancy: 4,
    roomsAvailable: 2,
    baseRate: 119,
  },
  {
    roomTypeId: "RT_ACC_KING",
    roomTypeName: "Accessible King Room",
    roomTypeDescription:
      "At more than 325 sq ft, this Accessible King Room includes standard King amenities and mobility-access bathroom features including wide doorway, grab bars, shower seat availability, and roll-under sink.",
    features: [
      "Ceiling fan",
      "Air-conditioning",
      "Cribs upon request",
      "Coffee maker",
      "Wireless internet (WiFi)",
      "Cable television",
      "Hairdryer",
      "Microwave",
      "Mini fridge",
      "Free parking",
    ],
    maxOccupancy: 2,
    roomsAvailable: 1,
    baseRate: 109,
  },
  {
    roomTypeId: "RT_ACC_QN",
    roomTypeName: "Accessible Two Queen Room",
    roomTypeDescription:
      "At more than 325 sq ft, this Accessible Two Queen Room includes standard Two Queen amenities with mobility-access bathroom features including wide doorway, grab bars, shower seat availability, and roll-under sink.",
    features: [
      "Ceiling fan",
      "Cribs upon request",
      "Air-conditioning",
      "Coffee maker",
      "Wireless internet (WiFi)",
      "Cable television",
      "Hairdryer",
      "Microwave",
      "Mini fridge",
      "Free parking",
    ],
    maxOccupancy: 4,
    roomsAvailable: 1,
    baseRate: 119,
  },
  {
    roomTypeId: "RT_BUNK_SUITE",
    roomTypeName: "Bunk Suite",
    roomTypeDescription:
      "At nearly 400 sq ft, Bunk Suite features a King bed and Queen-Full bunk bed, private bathroom with tub, table/chairs, non-smoking setup, Wi-Fi, air conditioning, microwave, mini fridge, coffee maker, and hair dryer.",
    features: [
      "Ceiling fan",
      "Cribs upon request",
      "Air-conditioning",
      "Coffee maker",
      "Wireless internet (WiFi)",
      "Cable television",
      "Hairdryer",
      "Microwave",
      "Mini fridge",
      "Free parking",
    ],
    maxOccupancy: 5,
    roomsAvailable: 1,
    baseRate: 159,
  },
  {
    roomTypeId: "RT_PREMIER_SUITE",
    roomTypeName: "Premier Suite",
    roomTypeDescription:
      "At nearly 600 sq ft, Premier Suite has two separate bedrooms, pullout sofa, dining table, desk, and non-smoking setup with Wi-Fi, renovated bathroom with tub, air conditioning, microwave, mini fridge, and coffee maker.",
    features: [
      "Ceiling fan",
      "Cribs upon request",
      "Air-conditioning",
      "Coffee maker",
      "Wireless internet (WiFi)",
      "Cable television",
      "Hairdryer",
      "Microwave",
      "Mini fridge",
      "Free parking",
      "Sleep sofa",
    ],
    maxOccupancy: 6,
    roomsAvailable: 1,
    baseRate: 179,
  },
  {
    roomTypeId: "RT_FAMILY_SUITE",
    roomTypeName: "Family Suite",
    roomTypeDescription:
      "At nearly 500 sq ft, Family Suite features two bedrooms (two queens and one king), two TVs, renovated tub bathroom, and standard non-smoking amenities.",
    features: [
      "Ceiling fan",
      "Air-conditioning",
      "Coffee maker",
      "Wireless internet (WiFi)",
      "Cable television",
      "Hairdryer",
      "Microwave",
      "Mini fridge",
      "Free parking",
    ],
    maxOccupancy: 6,
    roomsAvailable: 0,
    baseRate: 169,
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
