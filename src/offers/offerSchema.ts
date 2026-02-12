import { z } from "zod";

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const toPositiveInt = (value: unknown): number | undefined => {
  const numeric = toNumber(value);
  if (typeof numeric !== "number" || numeric <= 0) {
    return undefined;
  }
  return Math.floor(numeric);
};

const toNonNegativeInt = (value: unknown): number | undefined => {
  const numeric = toNumber(value);
  if (typeof numeric !== "number" || numeric < 0) {
    return undefined;
  }
  return Math.floor(numeric);
};

const parseBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const parseString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export type OfferSlots = {
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  rooms: number;
  children: number;
  pet_friendly: boolean;
  accessible_room: boolean;
  needs_two_beds: boolean;
  parking_needed: boolean;
  stub_scenario: string;
};

export type OfferSlotsInput = Partial<OfferSlots>;

export const offerSlotsInputSchema = z.object({
  check_in: z.string().optional(),
  check_out: z.string().optional(),
  nights: z.number().int().positive().optional(),
  adults: z.number().int().positive().optional(),
  rooms: z.number().int().positive().optional(),
  children: z.number().int().nonnegative().optional(),
  pet_friendly: z.boolean().optional(),
  accessible_room: z.boolean().optional(),
  needs_two_beds: z.boolean().optional(),
  parking_needed: z.boolean().optional(),
  stub_scenario: z.string().optional(),
});

export const offerIntentPatchSchema = z.object({
  check_in: z.string().nullable().optional(),
  check_out: z.string().nullable().optional(),
  nights: z.number().int().positive().nullable().optional(),
  adults: z.number().int().positive().nullable().optional(),
  rooms: z.number().int().positive().nullable().optional(),
  children: z.number().int().nonnegative().nullable().optional(),
  pet_friendly: z.boolean().nullable().optional(),
  accessible_room: z.boolean().nullable().optional(),
  needs_two_beds: z.boolean().nullable().optional(),
  parking_needed: z.boolean().nullable().optional(),
  stub_scenario: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  property_timezone: z.string().optional(),
  confirmation_pending: z.boolean().optional(),
});

export type OfferIntentPatch = z.infer<typeof offerIntentPatchSchema>;

export const coerceOfferSlotsInput = (raw: unknown): OfferSlotsInput => {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const args = raw as Record<string, unknown>;

  return {
    check_in: parseString(args.check_in),
    check_out: parseString(args.check_out),
    nights: toPositiveInt(args.nights),
    adults: toPositiveInt(args.adults),
    rooms: toPositiveInt(args.rooms),
    children: toNonNegativeInt(args.children),
    pet_friendly: parseBoolean(args.pet_friendly),
    accessible_room: parseBoolean(args.accessible_room),
    needs_two_beds: parseBoolean(args.needs_two_beds),
    parking_needed: parseBoolean(args.parking_needed),
    stub_scenario: parseString(args.stub_scenario),
  };
};
