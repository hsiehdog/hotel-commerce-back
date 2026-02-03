import { createEmptyOfferIntent, type OfferIntent } from "./offerIntent";
import { buildSlotSpeech, resolveOfferSlots } from "./getOffersTool";

export type ToolCallContext = {
  name: string;
  args: unknown;
  session?: { intent: OfferIntent };
  now?: Date;
};

export type ToolOutput =
  | {
      status: "OK";
      slots: OfferIntent;
      message: string;
      speech: string;
    }
  | {
      status: "NEEDS_CLARIFICATION";
      missingFields: string[];
      clarificationPrompt: string;
      slots: OfferIntent;
    }
  | {
      status: "ERROR";
      message: string;
    };

export const dispatchToolCall = ({ name, args, session, now }: ToolCallContext): ToolOutput => {
  if (name !== "get_offers") {
    return { status: "ERROR", message: "Unknown tool" };
  }

  const intent = session?.intent ?? createEmptyOfferIntent();
  const result = resolveOfferSlots(intent, args, now);

  if (session) {
    session.intent = result.slots;
  }

  if (result.status === "NEEDS_CLARIFICATION") {
    return result;
  }

  return {
    status: "OK",
    slots: result.slots,
    message: "Get offers tool will be called now with the following slots",
    speech: buildSlotSpeech(result.slots),
  };
};
