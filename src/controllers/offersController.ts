import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { createEmptyOfferIntent, type OfferIntent } from "../ai/offerIntent";
import { ApiError } from "../middleware/errorHandler";
import { generateOffers } from "../services/offerGenerationService";

const slotsSchema = z.object({
  check_in: z.string().optional(),
  check_out: z.string().optional(),
  nights: z.number().int().positive().optional(),
  adults: z.number().int().positive().optional(),
  rooms: z.number().int().positive().optional(),
  children: z.number().int().nonnegative().optional(),
  pet_friendly: z.boolean().optional(),
  accessible_room: z.boolean().optional(),
  needs_two_beds: z.boolean().optional(),
  budget_cap: z.number().positive().optional(),
  parking_needed: z.boolean().optional(),
});

const intentSchema = z.object({
  check_in: z.string().nullable().optional(),
  check_out: z.string().nullable().optional(),
  nights: z.number().int().positive().nullable().optional(),
  adults: z.number().int().positive().nullable().optional(),
  rooms: z.number().int().positive().nullable().optional(),
  children: z.number().int().nonnegative().nullable().optional(),
  pet_friendly: z.boolean().nullable().optional(),
  accessible_room: z.boolean().nullable().optional(),
  needs_two_beds: z.boolean().nullable().optional(),
  budget_cap: z.number().positive().nullable().optional(),
  parking_needed: z.boolean().nullable().optional(),
  language: z.string().nullable().optional(),
  property_timezone: z.string().optional(),
  confirmation_pending: z.boolean().optional(),
});

const generateOffersSchema = z.object({
  slots: slotsSchema.default({}),
  intent: intentSchema.optional(),
});

const buildIntent = (patch: z.infer<typeof intentSchema>): OfferIntent => ({
  ...createEmptyOfferIntent(),
  ...patch,
});

export const generateOffersForChannel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { slots, intent } = generateOffersSchema.parse(req.body);
    const data = generateOffers({
      args: slots,
      currentIntent: intent ? buildIntent(intent) : undefined,
    });

    res.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ApiError("Invalid request body", 400, error.flatten()));
      return;
    }

    next(error);
  }
};
