import { logger } from "../utils/logger";
import { createEmptyOfferIntent, type OfferIntent } from "../ai/offerIntent";

export type CollectedIntent = {
  dates: {
    checkIn?: string | null;
    checkOut?: string | null;
  };
  guests?: number | null;
};

export type CallSession = {
  callId: string;
  streamId?: string | null;
  callerNumber?: string | null;
  language?: string | null;
  collectedIntent: CollectedIntent;
  offers: unknown[];
  intent: OfferIntent;
  createdAt: Date;
  updatedAt: Date;
};

type TwilioStartPayload = {
  callSid: string;
  streamSid?: string;
  from?: string;
};

type TwilioStopPayload = {
  callSid?: string;
  streamSid?: string;
};

type TwilioMediaPayload = {
  payload: string;
};

export type TwilioStreamMessage =
  | { event: "start"; start: TwilioStartPayload }
  | { event: "media"; media: TwilioMediaPayload }
  | { event: "stop"; stop: TwilioStopPayload }
  | { event: string; [key: string]: unknown };

export type TwilioStreamAction =
  | { type: "start"; callId: string; streamId?: string | null; callerNumber?: string | null }
  | { type: "media"; payload: string }
  | { type: "stop"; callId?: string | null; streamId?: string | null };

const sessions = new Map<string, CallSession>();

const buildEmptyIntent = (): CollectedIntent => ({
  dates: {},
  guests: null,
});

const upsertSessionFromStart = (payload: TwilioStartPayload): CallSession => {
  const existing = sessions.get(payload.callSid);
  const now = new Date();

  const session: CallSession = {
    callId: payload.callSid,
    streamId: payload.streamSid ?? existing?.streamId ?? null,
    callerNumber: payload.from ?? existing?.callerNumber ?? null,
    language: existing?.language ?? null,
    collectedIntent: existing?.collectedIntent ?? buildEmptyIntent(),
    offers: existing?.offers ?? [],
    intent: existing?.intent ?? createEmptyOfferIntent(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  sessions.set(payload.callSid, session);
  return session;
};

const touchSession = (callId: string): void => {
  const session = sessions.get(callId);
  if (!session) {
    return;
  }

  session.updatedAt = new Date();
};

const endSession = (callId: string): void => {
  sessions.delete(callId);
};

export const parseTwilioStreamMessage = (rawData: string): TwilioStreamMessage | null => {
  try {
    const parsed = JSON.parse(rawData) as TwilioStreamMessage;
    if (!parsed || typeof parsed !== "object" || typeof parsed.event !== "string") {
      return null;
    }
    return parsed;
  } catch (error) {
    logger.warn("Failed to parse Twilio stream message", error);
    return null;
  }
};

export const handleTwilioStreamMessage = (
  message: TwilioStreamMessage,
  state: { callId?: string; streamId?: string },
): TwilioStreamAction | null => {
  if (isStartMessage(message)) {
    const session = upsertSessionFromStart(message.start);
    state.callId = session.callId;
    state.streamId = session.streamId ?? undefined;
    logger.info("Twilio stream started", { callId: session.callId, streamId: session.streamId });
    return {
      type: "start",
      callId: session.callId,
      streamId: session.streamId ?? null,
      callerNumber: session.callerNumber ?? null,
    };
  }

  if (isMediaMessage(message)) {
    if (state.callId) {
      touchSession(state.callId);
    }
    return { type: "media", payload: message.media.payload };
  }

  if (isStopMessage(message)) {
    const callId = message.stop.callSid ?? state.callId;
    if (callId) {
      endSession(callId);
      logger.info("Twilio stream stopped", { callId, streamId: message.stop.streamSid ?? state.streamId });
    }
    return { type: "stop", callId: callId ?? null, streamId: message.stop.streamSid ?? state.streamId ?? null };
  }

  return null;
};

export const getSession = (callId: string): CallSession | undefined => sessions.get(callId);

export const clearSession = (callId: string): void => {
  sessions.delete(callId);
};

export const listSessions = (): CallSession[] => Array.from(sessions.values());

export const clearAllSessions = (): void => {
  sessions.clear();
};

const isStartMessage = (message: TwilioStreamMessage): message is { event: "start"; start: TwilioStartPayload } =>
  message.event === "start" && typeof message.start === "object" && message.start !== null;

const isMediaMessage = (message: TwilioStreamMessage): message is { event: "media"; media: TwilioMediaPayload } =>
  message.event === "media" && typeof message.media === "object" && message.media !== null;

const isStopMessage = (message: TwilioStreamMessage): message is { event: "stop"; stop: TwilioStopPayload } =>
  message.event === "stop" && typeof message.stop === "object" && message.stop !== null;
