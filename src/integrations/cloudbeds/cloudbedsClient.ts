export type CloudbedsAriRequest = {
  propertyId: string;
  checkIn: string;
  checkOut?: string;
  nights?: number;
  adults: number;
  rooms: number;
  children?: number;
  pet_friendly?: boolean;
  accessible_room?: boolean;
  needs_two_beds?: boolean;
  parking_needed?: boolean;
  budget_cap?: number;
  currency: string;
  timezone: string;
};

export type CloudbedsAriRaw = {
  propertyId: string;
  currency: string;
  startDate: string;
  endDate: string;
  timezone: string;
  pricingAssumptions: string;
  roomTypes: CloudbedsRoomTypeRaw[];
};

export type CloudbedsRoomTypeRaw = {
  roomTypeId: string;
  roomTypeName: string;
  maxOccupancy: number;
  roomsAvailable: number;
  ratePlans: CloudbedsRatePlanRaw[];
};

export type CloudbedsRatePlanRaw = {
  ratePlanId: string;
  ratePlanName: string;
  refundability: "REFUNDABLE" | "NON_REFUNDABLE";
  paymentTiming: "PAY_AT_HOTEL" | "PAY_NOW";
  cancellationPolicy: {
    type: "FREE_CANCEL" | "NO_REFUND";
    freeCancelUntil?: string;
  };
  detailedRates: Array<{
    date: string;
    rate: number;
    available: boolean;
    minLos: number;
    cta: boolean;
    ctd: boolean;
  }>;
  totalRate: number;
  taxesAndFees: number;
};

const BASE_ROOM_TYPES: Array<{
  roomTypeId: string;
  roomTypeName: string;
  maxOccupancy: number;
  roomsAvailable: number;
  baseRate: number;
}> = [
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

export const getAriRaw = (request: CloudbedsAriRequest): CloudbedsAriRaw => {
  const nights = resolveNights(request);
  const endDate = request.checkOut ?? addDays(request.checkIn, nights);
  const children = request.children ?? 0;
  const occupancy = request.adults + children;
  const roomsRequested = request.rooms;

  const roomTypes = BASE_ROOM_TYPES.filter((roomType) => {
    if (request.accessible_room && roomType.roomTypeId !== "RT_ACC_KING") {
      return false;
    }

    if (!request.accessible_room && roomType.roomTypeId === "RT_ACC_KING") {
      return false;
    }

    if (request.needs_two_beds && roomType.roomTypeId !== "RT_QN") {
      return false;
    }

    if (occupancy > roomType.maxOccupancy) {
      return false;
    }

    if (roomsRequested > roomType.roomsAvailable) {
      return false;
    }

    return true;
  }).map((roomType) => buildRoomType(roomType, request, nights));

  return {
    propertyId: request.propertyId,
    currency: request.currency,
    startDate: request.checkIn,
    endDate,
    timezone: request.timezone,
    pricingAssumptions: "Stubbed ARI pricing: base rates by room type, 12% tax, 15% discount for pay-now.",
    roomTypes,
  };
};

const buildRoomType = (
  roomType: (typeof BASE_ROOM_TYPES)[number],
  request: CloudbedsAriRequest,
  nights: number,
): CloudbedsRoomTypeRaw => {
  const { checkIn, adults, children = 0, rooms } = request;
  const adjustedBase = adjustBaseRate(roomType.baseRate, request, adults, children);
  const flexibleRates = buildDailyRates(checkIn, nights, adjustedBase);
  const nonRefundRates = buildDailyRates(checkIn, nights, round2(adjustedBase * 0.85));

  const flexibleTotal = round2(sumRates(flexibleRates) * rooms);
  const nonRefundTotal = round2(sumRates(nonRefundRates) * rooms);

  const flexibleTaxes = round2(flexibleTotal * 0.12);
  const nonRefundTaxes = round2(nonRefundTotal * 0.12);

  return {
    roomTypeId: roomType.roomTypeId,
    roomTypeName: roomType.roomTypeName,
    maxOccupancy: roomType.maxOccupancy,
    roomsAvailable: roomType.roomsAvailable,
    ratePlans: [
      {
        ratePlanId: "RP_FLEX",
        ratePlanName: "Flexible",
        refundability: "REFUNDABLE",
        paymentTiming: "PAY_AT_HOTEL",
        cancellationPolicy: {
          type: "FREE_CANCEL",
          freeCancelUntil: addDays(checkIn, -2),
        },
        detailedRates: flexibleRates.map((rate) => ({
          date: rate.date,
          rate: rate.rate,
          available: true,
          minLos: 1,
          cta: false,
          ctd: false,
        })),
        totalRate: flexibleTotal,
        taxesAndFees: flexibleTaxes,
      },
      {
        ratePlanId: "RP_PAYNOW",
        ratePlanName: "Pay Now Saver",
        refundability: "NON_REFUNDABLE",
        paymentTiming: "PAY_NOW",
        cancellationPolicy: {
          type: "NO_REFUND",
        },
        detailedRates: nonRefundRates.map((rate) => ({
          date: rate.date,
          rate: rate.rate,
          available: true,
          minLos: 1,
          cta: false,
          ctd: false,
        })),
        totalRate: nonRefundTotal,
        taxesAndFees: nonRefundTaxes,
      },
    ],
  };
};

const buildDailyRates = (checkIn: string, nights: number, baseRate: number): Array<{ date: string; rate: number }> => {
  const rates: Array<{ date: string; rate: number }> = [];
  for (let i = 0; i < nights; i += 1) {
    const date = addDays(checkIn, i);
    rates.push({ date, rate: round2(baseRate + i * 5) });
  }
  return rates;
};

const adjustBaseRate = (
  baseRate: number,
  request: CloudbedsAriRequest,
  adults: number,
  children: number,
): number => {
  let rate = baseRate;

  if (adults > 2) {
    rate += (adults - 2) * 20;
  }

  if (children > 0) {
    rate += children * 10;
  }

  if (request.pet_friendly) {
    rate += 25;
  }

  if (request.parking_needed) {
    rate += 15;
  }

  if (typeof request.budget_cap === "number" && request.budget_cap > 0) {
    rate = Math.min(rate, Math.max(80, Math.floor(request.budget_cap * 0.95)));
  }

  return Math.max(80, round2(rate));
};

const resolveNights = (request: CloudbedsAriRequest): number => {
  if (request.nights && request.nights > 0) {
    return request.nights;
  }

  if (request.checkOut) {
    return diffDays(request.checkIn, request.checkOut);
  }

  return 1;
};

const diffDays = (start: string, end: string): number => {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)));
};

const addDays = (date: string, days: number): string => {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

const sumRates = (rates: Array<{ date: string; rate: number }>): number =>
  rates.reduce((total, entry) => total + entry.rate, 0);

const round2 = (value: number): number => Math.round(value * 100) / 100;

export default {
  getAriRaw,
};
