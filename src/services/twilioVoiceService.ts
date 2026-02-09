import { twiml } from "twilio";
import env, { appBaseUrl } from "../config/env";

type IncomingVoiceTwiMLInput = {
  streamUrl: string;
  greeting?: string | null;
};

const buildIncomingVoiceTwiML = ({ streamUrl, greeting }: IncomingVoiceTwiMLInput): string => {
  const response = new twiml.VoiceResponse();

  if (greeting && greeting.trim().length > 0) {
    response.say(greeting.trim());
  }

  const connect = response.connect();
  connect.stream({ url: streamUrl });

  return response.toString();
};

const buildDefaultStreamUrl = (baseUrl: string): string => {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/twilio/voice/stream";
  url.search = "";
  url.hash = "";
  return url.toString();
};

export const getIncomingVoiceTwiML = (): string => {
  const streamUrl = env.TWILIO_VOICE_STREAM_URL ?? buildDefaultStreamUrl(appBaseUrl);

  return buildIncomingVoiceTwiML({
    streamUrl,
    greeting: env.TWILIO_VOICE_GREETING ?? null,
  });
};
