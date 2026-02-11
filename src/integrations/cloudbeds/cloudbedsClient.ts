import {
  CLOUDBEDS_ARI_ASSUMPTIONS,
} from "./cloudbedsAriSeedData";
import { getRatePlansStub } from "./cloudbedsGetRatePlansStub";

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
  stubScenario?: string;
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
  roomTypeDescription?: string;
  features?: string[];
  maxOccupancy: number;
  roomsAvailable: number;
  totalInventory?: number | null;
  ratePlans: CloudbedsRatePlanRaw[];
};

export type CloudbedsRatePlanRaw = {
  ratePlanId: string;
  ratePlanName: string;
  refundability: "REFUNDABLE" | "NON_REFUNDABLE";
  paymentTiming: "PAY_AT_HOTEL" | "PAY_NOW";
  currency?: string;
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
  totalRate?: number | null;
  taxesAndFees?: number | null;
  totalAfterTax?: number | null;
};

export const getAriRaw = (request: CloudbedsAriRequest): CloudbedsAriRaw => {
  const ratePlansResponse = getRatePlansStub({
    propertyId: request.propertyId,
    checkIn: request.checkIn,
    checkOut: request.checkOut,
    nights: request.nights,
    adults: request.adults,
    rooms: request.rooms,
    children: request.children,
    pet_friendly: request.pet_friendly,
    accessible_room: request.accessible_room,
    needs_two_beds: request.needs_two_beds,
    parking_needed: request.parking_needed,
    budget_cap: request.budget_cap,
    currency: request.currency,
    scenario: request.stubScenario,
  });

  return {
    propertyId: ratePlansResponse.propertyId,
    currency: ratePlansResponse.currency,
    startDate: ratePlansResponse.startDate,
    endDate: ratePlansResponse.endDate,
    timezone: request.timezone,
    pricingAssumptions: `${CLOUDBEDS_ARI_ASSUMPTIONS.pricingAssumptions} Source: getRatePlans stub.`,
    roomTypes: ratePlansResponse.roomTypes.map((roomType) => ({
      roomTypeId: roomType.roomTypeID,
      roomTypeName: roomType.roomTypeName,
      roomTypeDescription: roomType.roomTypeDescription,
      features: roomType.features,
      maxOccupancy: roomType.maxOccupancy,
      roomsAvailable: roomType.roomsAvailable,
      totalInventory: roomType.totalInventory ?? null,
      ratePlans: roomType.ratePlans.map((plan) => ({
        ratePlanId: plan.ratePlanID,
        ratePlanName: plan.ratePlanNamePublic,
        refundability: plan.refundability,
        paymentTiming: plan.paymentTiming,
        currency: plan.currency,
        cancellationPolicy: {
          type: plan.cancellationPolicy.type,
          freeCancelUntil: plan.cancellationPolicy.freeCancelUntil,
        },
        detailedRates: plan.detailedRates.map((rate) => ({
          date: rate.date,
          rate: rate.roomRate,
          available: rate.available,
          minLos: rate.minLos,
          cta: rate.cta,
          ctd: rate.ctd,
        })),
        totalRate: plan.totalRate,
        taxesAndFees: plan.taxesAndFees,
        totalAfterTax: plan.totalAfterTax,
      })),
    })),
  };
};
