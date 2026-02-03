import type { Server } from "http";
import { WebSocketServer } from "ws";
import type { RawData } from "ws";
import { logger } from "../utils/logger";
import { createOpenAiRealtimeClient } from "../integrations/openaiRealtimeClient";
import twilioWordCountPrompt from "../prompts/system/twilioWordCountPrompt";
import {
  clearSession,
  handleTwilioStreamMessage,
  parseTwilioStreamMessage,
} from "../services/twilioMediaStreamService";

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
      instructions: twilioWordCountPrompt,
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
