import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { createEmptyOfferIntent, type OfferIntent } from "../ai/offerIntent";
import { ApiError } from "../middleware/errorHandler";
import { offerIntentPatchSchema, offerSlotsInputSchema, type OfferIntentPatch } from "../offers/offerSchema";
import { generateOffers } from "../services/offerGenerationService";

const generateOffersSchema = z.object({
  slots: offerSlotsInputSchema.default({}),
  intent: offerIntentPatchSchema.optional(),
});

const buildIntent = (patch: OfferIntentPatch): OfferIntent => ({
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
