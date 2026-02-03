import type { Server } from "http";
import { WebSocketServer } from "ws";
import type { RawData } from "ws";
import { logger } from "../utils/logger";
import { createOpenAiRealtimeClient } from "../integrations/openaiRealtimeClient";
import twilioOffersPrompt from "../prompts/system/twilioOffersPrompt";
import {
  clearSession,
  getSession,
  handleTwilioStreamMessage,
  parseTwilioStreamMessage,
} from "../services/twilioMediaStreamService";
import { createEmptyOfferIntent } from "../ai/offerIntent";
import { handleGetOffersToolCall } from "../ai/getOffersTool";

type ConnectionState = {
  callId?: string;
  streamId?: string;
};

const getRawMessage = (data: RawData): string | null => {
  if (typeof data === "string") {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf-8");
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf-8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf-8");
  }

  return null;
};

export const attachTwilioMediaStreamServer = (server: Server): WebSocketServer => {
  const wss = new WebSocketServer({
    server,
    path: "/twilio/voice/stream",
  });

  wss.on("connection", (socket) => {
    logger.info("Twilio WebSocket connected");
    const state: ConnectionState = {};
    const realtime = createOpenAiRealtimeClient({
      instructions: twilioOffersPrompt,
      tools: [
        {
          name: "get_offers",
          description:
            "Get hotel offers after all required slots are provided and unambiguous: check_in, check_out or nights, adults, rooms.",
          parameters: {
            type: "object",
            properties: {
              check_in: { type: "string", description: "Check-in date in YYYY-MM-DD format." },
              check_out: { type: "string", description: "Check-out date in YYYY-MM-DD format." },
              nights: { type: "integer", description: "Number of nights if check_out is not provided." },
              adults: { type: "integer", description: "Number of adults." },
              rooms: { type: "integer", description: "Number of rooms." },
              children: { type: "integer", description: "Number of children." },
              pet_friendly: { type: "boolean", description: "Whether a pet-friendly room is needed." },
              accessible_room: { type: "boolean", description: "Whether an accessible room is needed." },
              needs_two_beds: { type: "boolean", description: "Whether two beds are required." },
              budget_cap: { type: "number", description: "Maximum budget per night." },
              parking_needed: { type: "boolean", description: "Whether parking is needed." },
            },
          },
        },
      ],
      onAudioDelta: (base64Audio) => {
        if (!state.streamId) {
          return;
        }

        socket.send(
          JSON.stringify({
            event: "media",
            streamSid: state.streamId,
            media: { payload: base64Audio },
          }),
        );
      },
      onTranscript: (text) => {
        logger.info("OpenAI Realtime transcript", { callId: state.callId, text });
      },
      onFunctionCall: ({ name, callId, arguments: args }) => {
        if (name !== "get_offers") {
          return;
        }

        const session = state.callId ? getSession(state.callId) : undefined;
        const intent = session?.intent ?? createEmptyOfferIntent();
        const result = handleGetOffersToolCall(intent, args);

        if (session) {
          session.intent = result.slots;
          session.pendingAction =
            result.status === "NEEDS_CLARIFICATION"
              ? { type: "clarification", missingFields: result.missingFields, prompt: result.clarificationPrompt }
              : null;
        }

        realtime.sendFunctionCallOutput(callId, result);
        realtime.requestResponse();
      },
    });

    socket.on("message", (data) => {
      const raw = getRawMessage(data);
      if (!raw) {
        logger.warn("Received non-text Twilio stream message");
        return;
      }

      const message = parseTwilioStreamMessage(raw);
      if (!message) {
        return;
      }

      const action = handleTwilioStreamMessage(message, state);
      if (!action) {
        return;
      }

      if (action.type === "start") {
        state.streamId = action.streamId ?? state.streamId;
        return;
      }

      if (action.type === "media") {
        realtime.sendAudio(action.payload);
        return;
      }

      if (action.type === "stop") {
        realtime.close();
      }
    });

    socket.on("close", () => {
      logger.info("Twilio WebSocket disconnected", { callId: state.callId, streamId: state.streamId });
      if (state.callId) {
        clearSession(state.callId);
      }
      realtime.close();
    });
  });

  return wss;
};
