import {
  CLOUDBEDS_ARI_ASSUMPTIONS,
  CLOUDBEDS_ARI_RULES,
  CLOUDBEDS_BASE_ROOM_TYPES,
  CLOUDBEDS_RATE_PLAN_SEEDS,
  type CloudbedsAriSeedRoomType,
} from "./cloudbedsAriSeedData";

export type CloudbedsStubScenario =
  | "default"
  | "saver_primary_accessible"
  | "currency_mismatch"
  | "before_tax_only"
  | "invalid_pricing";

export type CloudbedsGetRatePlansRequest = {
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
  scenario?: string;
};

export type CloudbedsGetRatePlansResponse = {
  propertyId: string;
  currency: string;
  startDate: string;
  endDate: string;
  roomTypes: CloudbedsGetRatePlansRoomType[];
};

export type CloudbedsGetRatePlansRoomType = {
  roomTypeID: string;
  roomTypeName: string;
  maxOccupancy: number;
  roomsAvailable: number;
  totalInventory?: number | null;
  ratePlans: CloudbedsGetRatePlan[];
};

export type CloudbedsGetRatePlan = {
  ratePlanID: string;
  ratePlanNamePublic: string;
  refundability: "REFUNDABLE" | "NON_REFUNDABLE";
  paymentTiming: "PAY_AT_HOTEL" | "PAY_NOW";
  currency?: string;
  cancellationPolicy: {
    type: "FREE_CANCEL" | "NO_REFUND";
    freeCancelUntil?: string;
  };
  detailedRates: Array<{
    date: string;
    roomRate: number;
    available: boolean;
    minLos: number;
    cta: boolean;
    ctd: boolean;
  }>;
  totalRate?: number | null;
  taxesAndFees?: number | null;
  totalAfterTax?: number | null;
};

export const getRatePlansStub = (request: CloudbedsGetRatePlansRequest): CloudbedsGetRatePlansResponse => {
  const scenario = resolveScenario(request.scenario);
  const nights = resolveNights(request);
  const endDate = request.checkOut ?? addDays(request.checkIn, nights);
  const children = request.children ?? 0;
  const occupancy = request.adults + children;
  const roomsRequested = request.rooms;

  const roomTypes = CLOUDBEDS_BASE_ROOM_TYPES.filter((roomType) => {
    if (request.accessible_room && roomType.roomTypeId !== CLOUDBEDS_ARI_RULES.accessibleRoomTypeId) {
      return false;
    }
    if (!request.accessible_room && roomType.roomTypeId === CLOUDBEDS_ARI_RULES.accessibleRoomTypeId) {
      return false;
    }
    if (request.needs_two_beds && roomType.roomTypeId !== CLOUDBEDS_ARI_RULES.twoBedsRoomTypeId) {
      return false;
    }
    if (occupancy > roomType.maxOccupancy) {
      return false;
    }
    if (roomsRequested > roomType.roomsAvailable) {
      return false;
    }
    return true;
  }).map((roomType) => buildRoomTypeForScenario(roomType, request, scenario, nights));

  return {
    propertyId: request.propertyId,
    currency: request.currency,
    startDate: request.checkIn,
    endDate,
    roomTypes,
  };
};

const buildRoomTypeForScenario = (
  roomType: CloudbedsAriSeedRoomType,
  request: CloudbedsGetRatePlansRequest,
  scenario: CloudbedsStubScenario,
  nights: number,
): CloudbedsGetRatePlansRoomType => {
  const { checkIn, adults, children = 0, rooms } = request;
  const adjustedBase = adjustBaseRate(roomType.baseRate, request, adults, children);
  const flexibleRates = buildDailyRates(checkIn, nights, adjustedBase);
  const payNowDiscountRate =
    scenario === "saver_primary_accessible" && roomType.roomTypeId === CLOUDBEDS_ARI_RULES.accessibleRoomTypeId
      ? 0.35
      : CLOUDBEDS_ARI_ASSUMPTIONS.payNowDiscountRate;
  const nonRefundRates = buildDailyRates(checkIn, nights, round2(adjustedBase * (1 - payNowDiscountRate)));

  const flexibleTotal = round2(sumRates(flexibleRates) * rooms);
  const nonRefundTotal = round2(sumRates(nonRefundRates) * rooms);
  const flexibleTaxes = round2(flexibleTotal * CLOUDBEDS_ARI_ASSUMPTIONS.taxRate);
  const nonRefundTaxes = round2(nonRefundTotal * CLOUDBEDS_ARI_ASSUMPTIONS.taxRate);

  const ratePlans: CloudbedsGetRatePlan[] = [
    {
      ratePlanID: CLOUDBEDS_RATE_PLAN_SEEDS.flexible.ratePlanId,
      ratePlanNamePublic: CLOUDBEDS_RATE_PLAN_SEEDS.flexible.ratePlanName,
      refundability: CLOUDBEDS_RATE_PLAN_SEEDS.flexible.refundability,
      paymentTiming: CLOUDBEDS_RATE_PLAN_SEEDS.flexible.paymentTiming,
      currency: request.currency,
      cancellationPolicy: {
        type: CLOUDBEDS_RATE_PLAN_SEEDS.flexible.cancellationType,
        freeCancelUntil: addDays(checkIn, -CLOUDBEDS_ARI_ASSUMPTIONS.freeCancellationWindowDays),
      },
      detailedRates: toDetailedRates(flexibleRates),
      totalRate: flexibleTotal,
      taxesAndFees: flexibleTaxes,
      totalAfterTax: round2(flexibleTotal + flexibleTaxes),
    },
    {
      ratePlanID: CLOUDBEDS_RATE_PLAN_SEEDS.payNow.ratePlanId,
      ratePlanNamePublic: CLOUDBEDS_RATE_PLAN_SEEDS.payNow.ratePlanName,
      refundability: CLOUDBEDS_RATE_PLAN_SEEDS.payNow.refundability,
      paymentTiming: CLOUDBEDS_RATE_PLAN_SEEDS.payNow.paymentTiming,
      currency: request.currency,
      cancellationPolicy: {
        type: CLOUDBEDS_RATE_PLAN_SEEDS.payNow.cancellationType,
      },
      detailedRates: toDetailedRates(nonRefundRates),
      totalRate: nonRefundTotal,
      taxesAndFees: nonRefundTaxes,
      totalAfterTax: round2(nonRefundTotal + nonRefundTaxes),
    },
  ];

  applyScenarioRatePlanMutations(ratePlans, request.currency, scenario);

  return {
    roomTypeID: roomType.roomTypeId,
    roomTypeName: roomType.roomTypeName,
    maxOccupancy: roomType.maxOccupancy,
    roomsAvailable: roomType.roomsAvailable,
    totalInventory: roomType.roomsAvailable + 9,
    ratePlans,
  };
};

const applyScenarioRatePlanMutations = (
  plans: CloudbedsGetRatePlan[],
  defaultCurrency: string,
  scenario: CloudbedsStubScenario,
): void => {
  if (scenario === "currency_mismatch" && plans[1]) {
    plans[1].currency = defaultCurrency === "USD" ? "EUR" : "USD";
  }

  if (scenario === "before_tax_only") {
    for (const plan of plans) {
      plan.totalAfterTax = null;
      plan.taxesAndFees = null;
    }
  }

  if (scenario === "invalid_pricing") {
    for (const plan of plans) {
      plan.totalAfterTax = null;
      plan.totalRate = null;
      plan.taxesAndFees = null;
    }
  }
};

const toDetailedRates = (rates: Array<{ date: string; rate: number }>) =>
  rates.map((rate) => ({
    date: rate.date,
    roomRate: rate.rate,
    available: true,
    minLos: CLOUDBEDS_ARI_ASSUMPTIONS.minLengthOfStay,
    cta: false,
    ctd: false,
  }));

const buildDailyRates = (checkIn: string, nights: number, baseRate: number): Array<{ date: string; rate: number }> => {
  const rates: Array<{ date: string; rate: number }> = [];
  for (let i = 0; i < nights; i += 1) {
    const date = addDays(checkIn, i);
    rates.push({
      date,
      rate: round2(baseRate + i * CLOUDBEDS_ARI_ASSUMPTIONS.nightlyRateIncrement),
    });
  }
  return rates;
};

const adjustBaseRate = (
  baseRate: number,
  request: CloudbedsGetRatePlansRequest,
  adults: number,
  children: number,
): number => {
  let rate = baseRate;

  if (adults > CLOUDBEDS_ARI_ASSUMPTIONS.includedAdultCount) {
    rate += (adults - CLOUDBEDS_ARI_ASSUMPTIONS.includedAdultCount) * CLOUDBEDS_ARI_ASSUMPTIONS.extraAdultSurcharge;
  }
  if (children > 0) {
    rate += children * CLOUDBEDS_ARI_ASSUMPTIONS.childSurcharge;
  }
  if (request.pet_friendly) {
    rate += CLOUDBEDS_ARI_ASSUMPTIONS.petFriendlySurcharge;
  }
  if (request.parking_needed) {
    rate += CLOUDBEDS_ARI_ASSUMPTIONS.parkingSurcharge;
  }
  if (typeof request.budget_cap === "number" && request.budget_cap > 0) {
    rate = Math.min(
      rate,
      Math.max(
        CLOUDBEDS_ARI_ASSUMPTIONS.minNightlyRate,
        Math.floor(request.budget_cap * CLOUDBEDS_ARI_ASSUMPTIONS.budgetCapMultiplier),
      ),
    );
  }

  return Math.max(CLOUDBEDS_ARI_ASSUMPTIONS.minNightlyRate, round2(rate));
};

const resolveNights = (request: CloudbedsGetRatePlansRequest): number => {
  if (request.nights && request.nights > 0) {
    return request.nights;
  }
  if (request.checkOut) {
    return diffDays(request.checkIn, request.checkOut);
  }
  return CLOUDBEDS_ARI_ASSUMPTIONS.defaultNights;
};

const resolveScenario = (value?: string): CloudbedsStubScenario => {
  if (
    value === "saver_primary_accessible" ||
    value === "currency_mismatch" ||
    value === "before_tax_only" ||
    value === "invalid_pricing"
  ) {
    return value;
  }
  return "default";
};

const diffDays = (start: string, end: string): number => {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(CLOUDBEDS_ARI_ASSUMPTIONS.defaultNights, Math.round(diffMs / (24 * 60 * 60 * 1000)));
};

const addDays = (date: string, days: number): string => {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

const sumRates = (rates: Array<{ date: string; rate: number }>): number =>
  rates.reduce((total, entry) => total + entry.rate, 0);

const round2 = (value: number): number => Math.round(value * 100) / 100;
