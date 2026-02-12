export type AriSnapshot = {
  propertyId: string;
  currency: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomTypes: RoomTypeSnapshot[];
};

export type RoomTypeSnapshot = {
  roomTypeId: string;
  roomTypeName: string;
  roomTypeDescription?: string;
  features?: string[];
  isAccessible?: boolean;
  maxOccupancy: number;
  roomsAvailable: number;
  totalInventory?: number | null;
  ratePlans: RatePlanSnapshot[];
};

export type RatePlanSnapshot = {
  ratePlanId: string;
  ratePlanName: string;
  currency?: string | null;
  refundability: "REFUNDABLE" | "NON_REFUNDABLE" | "PARTIAL";
  paymentTiming: "PAY_NOW" | "PAY_LATER";
  cancellationPolicy: {
    freeCancelUntil?: string;
    penaltyDescription?: string;
  };
  pricing: {
    nightly: {
      date: string;
      baseRate: number;
    }[];
    totalBeforeTax?: number | null;
    taxesAndFees?: number | null;
    totalAfterTax?: number | null;
    includedFees?: {
      petFeePerNight: number;
      parkingFeePerNight: number;
    };
  };
  restrictions: {
    minLos?: number;
    maxLos?: number;
    cta?: boolean;
    ctd?: boolean;
  };
};
