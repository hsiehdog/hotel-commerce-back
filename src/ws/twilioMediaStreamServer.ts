import type { Server } from "http";
import { WebSocketServer } from "ws";
import type { RawData } from "ws";
import { logger } from "../utils/logger";
import {
  clearSession,
  handleTwilioStreamMessage,
  parseTwilioStreamMessage,
} from "../services/twilioMediaStreamService";
import { createVoiceOrchestrator } from "../services/voiceOrchestrator";

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
    const orchestrator = createVoiceOrchestrator({
      onOutboundAudio: (base64Audio, streamId) => {
        if (!streamId) {
          return;
        }

        socket.send(
          JSON.stringify({
            event: "media",
            streamSid: streamId,
            media: { payload: base64Audio },
          }),
        );
      },
      onSessionStarted: (callId) => {
        state.callId = callId;
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

      state.streamId = action.type === "start" ? action.streamId ?? state.streamId : state.streamId;
      orchestrator.state.streamId = state.streamId;
      orchestrator.handleAction(action);
    });

    socket.on("close", () => {
      logger.info("Twilio WebSocket disconnected", { callId: state.callId, streamId: state.streamId });
      if (state.callId) {
        clearSession(state.callId);
      }
      orchestrator.close();
    });
  });

  return wss;
};
