import { createEmptyOfferIntent, type OfferIntent } from "./offerIntent";
import type { OfferOption } from "./getOffersTool";
import { generateOffers, type OfferGenerationOutput } from "../services/offerGenerationService";

export type ToolCallContext = {
  name: string;
  args: unknown;
  session?: { intent: OfferIntent; offers?: OfferOption[] };
  now?: Date;
};

export type ToolOutput = OfferGenerationOutput | { status: "ERROR"; message: string };

export const dispatchToolCall = ({ name, args, session, now }: ToolCallContext): ToolOutput => {
  if (name !== "get_offers") {
    return { status: "ERROR", message: "Unknown tool" };
  }

  const result = generateOffers({
    args,
    currentIntent: session?.intent ?? createEmptyOfferIntent(),
    now,
  });

  if (session) {
    session.intent = result.slots;
    if (result.status === "OK") {
      session.offers = result.offers;
    }
  }

  return result;
};
