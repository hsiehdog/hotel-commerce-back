import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../middleware/errorHandler";
import { buildCommerceOffers } from "../services/commerce/buildCommerceOffers";
import { parseOffersGenerateRequest } from "../services/commerce/normalizeOfferRequest";
import { reasonCodesToCopy } from "../presentation/reasonCodeCopy";

export const generateOffersForChannel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = parseOffersGenerateRequest(req.body);
    const result = await buildCommerceOffers({
      request: parsed,
    });

    if (result.status === "ERROR") {
      next(new ApiError(result.message, 422, { missingFields: result.missingFields, slots: result.slots }));
      return;
    }

    const { reasonCodes, ...rest } = result.data;
    res.json({
      data: {
        ...rest,
        decisionTrace: reasonCodesToCopy(reasonCodes),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ApiError("Invalid request body", 400, error.flatten()));
      return;
    }

    next(error);
  }
};
