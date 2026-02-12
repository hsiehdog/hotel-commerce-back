import { z } from "zod";
import { ApiError } from "../../middleware/errorHandler";
import { calendarDayDiff, formatInZone } from "../../utils/dateTime";
import { prisma } from "../../lib/prisma";
import { buildCommerceProfilePreAri } from "./buildCommerceProfile";
import { resolvePropertyIdForRequest } from "../propertyContext/resolvePropertyIdForRequest";
import type { NormalizedOfferRequest, OfferGenerateRequestV1 } from "./types";

const topLevelSchema = z.object({
  property_id: z.string().optional(),
  channel: z.enum(["voice", "web", "agent"]).optional(),
  check_in: z.string().optional(),
  check_out: z.string().optional(),
  nights: z.number().int().positive().optional(),
  currency: z.string().optional(),
  rooms: z.number().int().positive().optional(),
  roomOccupancies: z
    .array(
      z.object({
        adults: z.number().int().nonnegative(),
        children: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  adults: z.number().int().nonnegative().optional(),
  children: z.number().int().nonnegative().optional(),
  child_ages: z.array(z.number().int().nonnegative()).optional(),
  preferences: z
    .object({
      needs_space: z.boolean().optional(),
      late_arrival: z.boolean().optional(),
    })
    .optional(),
  pet_friendly: z.boolean().optional(),
  accessible_room: z.boolean().optional(),
  needs_two_beds: z.boolean().optional(),
  budget_cap: z.number().positive().optional(),
  parking_needed: z.boolean().optional(),
  stub_scenario: z.string().optional(),
  debug: z.boolean().optional(),
});

export const parseOffersGenerateRequest = (raw: unknown): OfferGenerateRequestV1 => {
  return topLevelSchema.parse(raw);
};

export const normalizeOfferRequest = async (raw: OfferGenerateRequestV1): Promise<NormalizedOfferRequest> => {
  const propertyResolution = await resolvePropertyIdForRequest(raw.property_id);
  const propertyId = propertyResolution.propertyId;
  const property = await prisma.property
    .findUnique({
      where: { id: propertyId },
      select: { defaultCurrency: true },
    })
    .catch(() => null);

  const checkIn = raw.check_in;
  const checkOut = raw.check_out;
  if (!checkIn || !checkOut) {
    throw new ApiError("Sure - what check-in and check-out dates are you considering?", 422);
  }

  const nights = raw.nights ?? diffDays(checkIn, checkOut);
  if (nights <= 0) {
    throw new ApiError("Check-out must be after check-in.", 422);
  }

  const occupancyNormalization = normalizeRoomOccupancies(raw);
  const canonicalOccupancies = occupancyNormalization.roomOccupancies;
  const totalAdults = canonicalOccupancies.reduce((sum, room) => sum + room.adults, 0);
  const totalChildren = canonicalOccupancies.reduce((sum, room) => sum + room.children, 0);
  const rooms = canonicalOccupancies.length;

  if (raw.child_ages && raw.child_ages.length !== totalChildren) {
    throw new ApiError("child_ages must match total children count.", 400);
  }

  const now = new Date();
  const leadTimeDays = Math.max(0, diffDays(formatInZone(now, "UTC", "yyyy-MM-dd"), checkIn));
  const profile = buildCommerceProfilePreAri({
    adults: totalAdults,
    children: totalChildren,
    rooms,
    checkIn,
    nights,
    leadTimeDays,
    channel: raw.channel ?? "voice",
    preferences: raw.preferences,
  });

  const currency = raw.currency ?? property?.defaultCurrency ?? "USD";

  return {
    propertyId,
    channel: raw.channel ?? "voice",
    checkIn,
    checkOut,
    currency,
    rooms,
    roomOccupancies: canonicalOccupancies,
    totalAdults,
    totalChildren,
    childAges: raw.child_ages,
    nowUtcIso: now.toISOString(),
    nights,
    leadTimeDays,
    strategyMode: "balanced",
    capabilities: {
      canTextLink: false,
      canCollectWaitlist: true,
      hasWebBookingUrl: false,
    },
    profile,
    preferences: raw.preferences,
    petFriendly: raw.pet_friendly,
    accessibleRoom: raw.accessible_room,
    needsTwoBeds: raw.needs_two_beds,
    budgetCap: raw.budget_cap,
    parkingNeeded: raw.parking_needed,
    stubScenario: raw.stub_scenario,
    configVersion: 1,
    debug: raw.debug ?? false,
    occupancyDistributed: occupancyNormalization.distributed,
  };
};

const normalizeRoomOccupancies = (
  raw: OfferGenerateRequestV1,
): {
  roomOccupancies: Array<{ adults: number; children: number; childAges?: number[] }>;
  distributed: boolean;
} => {
  if (raw.roomOccupancies && raw.roomOccupancies.length > 0) {
    if (raw.roomOccupancies.some((room) => Array.isArray(room.childAges) && room.childAges.length >= 0)) {
      throw new ApiError("Per-room childAges are not supported in v1. Use top-level child_ages only.", 400);
    }
    if (raw.rooms && raw.rooms !== raw.roomOccupancies.length) {
      throw new ApiError("rooms must match roomOccupancies length.", 400);
    }
    const sumAdults = raw.roomOccupancies.reduce((sum, room) => sum + room.adults, 0);
    const sumChildren = raw.roomOccupancies.reduce((sum, room) => sum + room.children, 0);
    if (typeof raw.adults === "number" && raw.adults !== sumAdults) {
      throw new ApiError("adults must match roomOccupancies total adults.", 400);
    }
    if (typeof raw.children === "number" && raw.children !== sumChildren) {
      throw new ApiError("children must match roomOccupancies total children.", 400);
    }
    const normalized = raw.roomOccupancies.map((room) => ({
      adults: room.adults,
      children: room.children,
    }));
    if (normalized.some((room) => room.adults + room.children <= 0)) {
      throw new ApiError("Each room occupancy must include at least one guest in v1.", 400);
    }
    return {
      roomOccupancies: normalized,
      distributed: false,
    };
  }

  const rooms = raw.rooms ?? 1;
  const adults = raw.adults ?? 1;
  const children = raw.children ?? 0;
  const totalGuests = adults + children;
  if (rooms > totalGuests) {
    throw new ApiError("rooms cannot exceed total guests in v1 when roomOccupancies are omitted.", 400);
  }

  const occupancies = Array.from({ length: rooms }, () => ({ adults: 0, children: 0 }));
  let remainingAdults = adults;
  let remainingChildren = children;

  // Prefer placing one adult per room first when possible.
  for (let index = 0; index < rooms && remainingAdults > 0; index += 1) {
    occupancies[index]!.adults += 1;
    remainingAdults -= 1;
  }
  for (let index = 0; remainingAdults > 0; index = (index + 1) % rooms) {
    occupancies[index]!.adults += 1;
    remainingAdults -= 1;
  }
  for (let index = 0; remainingChildren > 0; index = (index + 1) % rooms) {
    occupancies[index]!.children += 1;
    remainingChildren -= 1;
  }

  if (occupancies.some((room) => room.adults + room.children <= 0)) {
    throw new ApiError("Each room occupancy must include at least one guest in v1.", 400);
  }

  return {
    roomOccupancies: occupancies,
    distributed: rooms > 1,
  };
};

const diffDays = (start: string, end: string): number => {
  return calendarDayDiff(end, start);
};
