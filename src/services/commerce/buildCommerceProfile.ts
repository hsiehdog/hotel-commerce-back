import type { CommerceProfile, DecisionPosture, InventoryState, TripType } from "./types";
import { dayOfWeekFromIsoDate } from "../../utils/dateTime";

type PreProfileInput = {
  adults: number;
  children: number;
  rooms: number;
  checkIn: string;
  nights: number;
  leadTimeDays: number;
  channel: "voice" | "web" | "agent";
};

type InventorySignalInput = {
  profile: CommerceProfile;
  roomsAvailable?: number;
};

export const buildCommerceProfilePreAri = (input: PreProfileInput): CommerceProfile => {
  const tripType = resolveTripType(input);
  const decisionPosture = resolveDecisionPosture({ ...input, tripType });
  return {
    tripType,
    decisionPosture,
    inventoryState: "unknown",
    leadTimeDays: input.leadTimeDays,
    nights: input.nights,
  };
};

export const finalizeCommerceProfileInventoryState = ({
  profile,
  roomsAvailable,
}: InventorySignalInput): CommerceProfile => {
  const inventoryState: InventoryState =
    typeof roomsAvailable !== "number" ? "unknown" : roomsAvailable <= 2 ? "low" : "normal";

  return {
    ...profile,
    inventoryState,
  };
};

const resolveTripType = (input: PreProfileInput): TripType => {
  if (input.children > 0) {
    return "family";
  }
  if (input.adults >= 3 || input.rooms > 1) {
    return "group_lite";
  }

  const weekday = isWeekday(input.checkIn);
  if (input.adults === 1 && weekday && input.nights <= 2) {
    return "business";
  }
  if (input.adults === 2 && isWeekend(input.checkIn)) {
    return "couple";
  }
  if (input.adults === 1) {
    return "solo";
  }
  return "group_lite";
};

const resolveDecisionPosture = (
  input: PreProfileInput & {
    tripType: TripType;
  },
): DecisionPosture => {
  if (input.leadTimeDays <= 2) {
    return "urgent";
  }
  if (input.leadTimeDays <= 7) {
    return "certainty";
  }
  if (input.nights >= 4) {
    return "price";
  }

  if (input.tripType === "family") {
    return "certainty";
  }
  if (input.tripType === "couple") {
    return "experience";
  }
  if (input.tripType === "business") {
    return "urgent";
  }
  if (input.tripType === "solo") {
    return "price";
  }
  return "price";
};

const isWeekend = (isoDate: string): boolean => {
  const day = dayOfWeekFromIsoDate(isoDate);
  return day === 5 || day === 6;
};

const isWeekday = (isoDate: string): boolean => {
  const day = dayOfWeekFromIsoDate(isoDate);
  return day >= 1 && day <= 4;
};
