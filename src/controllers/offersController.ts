import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { createEmptyOfferIntent, type OfferIntent } from "../ai/offerIntent";
import { ApiError } from "../middleware/errorHandler";
import { offerIntentPatchSchema, offerSlotsInputSchema, type OfferIntentPatch } from "../offers/offerSchema";
import { buildCommerceOffers } from "../services/commerce/buildCommerceOffers";

const generateOffersSchema = z.object({
  slots: offerSlotsInputSchema.default({}),
  intent: offerIntentPatchSchema.optional(),
});

const commerceRequestSchema = z.object({
  property_id: z.string().optional(),
  channel: z.enum(["voice", "web", "api"]).optional(),
  currency: z.string().optional(),
  check_in: z.string().optional(),
  check_out: z.string().optional(),
  nights: z.number().int().positive().optional(),
  rooms: z.number().int().positive().optional(),
  adults: z.number().int().positive().optional(),
  children: z.number().int().nonnegative().optional(),
  child_ages: z.array(z.number().int().nonnegative()).optional(),
  preferences: z
    .object({
      needs_space: z.boolean().optional(),
      late_arrival: z.boolean().optional(),
    })
    .optional(),
  stub_scenario: z.string().optional(),
});

const wrappedSlotPreferencesSchema = z.object({
  preferences: z
    .object({
      needs_space: z.boolean().optional(),
      late_arrival: z.boolean().optional(),
    })
    .optional(),
});

const buildIntent = (patch: OfferIntentPatch): OfferIntent => ({
  ...createEmptyOfferIntent(),
  ...patch,
});

export const generateOffersForChannel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const normalized = normalizeOffersRequest(req.body);
    const result = await buildCommerceOffers({
      slots: normalized.slots,
      currentIntent: normalized.intent ? buildIntent(normalized.intent) : undefined,
      propertyId: normalized.propertyId,
      channel: normalized.channel,
      requestCurrency: normalized.currency,
      preferences: normalized.preferences,
      childAges: normalized.childAges,
    });

    if (result.status === "ERROR") {
      next(new ApiError(result.message, 422, { missingFields: result.missingFields, slots: result.slots }));
      return;
    }

    res.json({ data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ApiError("Invalid request body", 400, error.flatten()));
      return;
    }

    next(error);
  }
};

type NormalizedOffersRequest = {
  slots: z.infer<typeof offerSlotsInputSchema>;
  intent?: OfferIntentPatch;
  propertyId?: string;
  channel?: "voice" | "web" | "api";
  currency?: string;
  preferences?: { needs_space?: boolean; late_arrival?: boolean };
  childAges?: number[];
};

const normalizeOffersRequest = (body: unknown): NormalizedOffersRequest => {
  if (body && typeof body === "object" && "slots" in (body as Record<string, unknown>)) {
    const wrapped = generateOffersSchema.parse(body);
    const rawSlots = (body as { slots?: unknown }).slots;
    const wrappedExtras = wrappedSlotPreferencesSchema.safeParse(rawSlots);
    return {
      slots: wrapped.slots,
      intent: wrapped.intent,
      preferences: wrappedExtras.success ? wrappedExtras.data.preferences : undefined,
    };
  }

  const commerce = commerceRequestSchema.parse(body);
  return {
    slots: {
      check_in: commerce.check_in,
      check_out: commerce.check_out,
      nights: commerce.nights,
      adults: commerce.adults,
      rooms: commerce.rooms,
      children: commerce.children,
      stub_scenario: commerce.stub_scenario,
    },
    propertyId: commerce.property_id,
    channel: commerce.channel,
    currency: commerce.currency,
    preferences: commerce.preferences,
    childAges: commerce.child_ages,
  };
};
