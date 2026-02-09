import { fetchLineTypeForNumber } from "../integrations/twilioLookupClient";
import { logger } from "../utils/logger";

type IncomingCallerLookupInput = {
  from: string;
};

export const logIncomingCallerLineType = ({ from }: IncomingCallerLookupInput): void => {
  if (!from || from.trim().length === 0) {
    return;
  }

  setImmediate(() => {
    void (async () => {
      try {
        const lineType = await fetchLineTypeForNumber(from);
        logger.info("Incoming caller line type", { from, lineType: lineType ?? "unknown" });
      } catch (error) {
        logger.warn("Failed to lookup incoming caller line type", { from, error });
      }
    })();
  });
};
