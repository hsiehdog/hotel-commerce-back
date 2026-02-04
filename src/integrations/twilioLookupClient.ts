import env from "../config/env";
import { logger } from "../utils/logger";

type TwilioLineTypeIntelligence = {
  type?: string | null;
};

type TwilioLookupResponse = {
  line_type_intelligence?: TwilioLineTypeIntelligence | null;
};

const buildLookupUrl = (phoneNumber: string): string => {
  const url = new URL(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`);
  url.searchParams.set("Fields", "line_type_intelligence");
  return url.toString();
};

const buildAuthHeader = (accountSid: string, authToken: string): string =>
  `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

export const fetchLineTypeForNumber = async (phoneNumber: string): Promise<string | null> => {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return null;
  }

  const response = await fetch(buildLookupUrl(phoneNumber), {
    headers: {
      Authorization: buildAuthHeader(accountSid, authToken),
    },
  });

  if (!response.ok) {
    logger.warn("Twilio lookup failed", { status: response.status });
    return null;
  }

  const payload = (await response.json()) as TwilioLookupResponse;
  return payload.line_type_intelligence?.type ?? null;
};

export default {
  fetchLineTypeForNumber,
};
