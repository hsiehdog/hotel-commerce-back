import WebSocket, { RawData } from "ws";
import env from "../config/env";
import { logger } from "../utils/logger";

type RealtimeClientOptions = {
  instructions: string;
  onAudioDelta: (base64Audio: string) => void;
  onTranscript?: (text: string) => void;
};

type RealtimeClient = {
  sendAudio: (base64Audio: string) => void;
  close: () => void;
};

const DEFAULT_MODEL = "gpt-realtime";
const DEFAULT_VOICE = "marin";

const buildRealtimeUrl = (model: string): string => {
  const url = new URL("wss://api.openai.com/v1/realtime");
  url.searchParams.set("model", model);
  return url.toString();
};

const buildSessionUpdate = (instructions: string, voice: string) => ({
  type: "session.update",
  session: {
    type: "realtime",
    instructions,
    audio: {
      input: {
        format: {
          type: "audio/pcmu",
        },
      },
      output: {
        format: {
          type: "audio/pcmu",
        },
        voice,
      },
    },
  },
});

export const createOpenAiRealtimeClient = ({
  instructions,
  onAudioDelta,
  onTranscript,
}: RealtimeClientOptions): RealtimeClient => {
  const model = env.OPENAI_REALTIME_MODEL ?? DEFAULT_MODEL;
  const voice = env.OPENAI_REALTIME_VOICE ?? DEFAULT_VOICE;
  const url = buildRealtimeUrl(model);

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
  });

  const pendingAudio: string[] = [];
  let isReady = false;

  const flushPending = () => {
    while (pendingAudio.length > 0 && ws.readyState === WebSocket.OPEN) {
      const audio = pendingAudio.shift();
      if (audio) {
        ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
      }
    }
  };

  ws.on("open", () => {
    ws.send(JSON.stringify(buildSessionUpdate(instructions, voice)));
    isReady = true;
    flushPending();
  });

  let transcriptBuffer = "";

  ws.on("message", (data: RawData) => {
    const raw =
      typeof data === "string"
        ? data
        : Buffer.isBuffer(data)
          ? data.toString("utf-8")
          : data instanceof ArrayBuffer
            ? Buffer.from(data).toString("utf-8")
            : Array.isArray(data)
              ? Buffer.concat(data).toString("utf-8")
              : null;

    if (!raw) {
      return;
    }

    try {
      const event = JSON.parse(raw) as { type?: string; delta?: string; [key: string]: unknown };
      if (event.type === "session.updated") {
        logger.info("OpenAI Realtime session updated");
      }

      if (event.type === "error") {
        logger.warn("OpenAI Realtime error", event);
      }

      if (
        (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") &&
        typeof event.delta === "string"
      ) {
        onAudioDelta(event.delta);
      }

      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        transcriptBuffer += event.delta;
      }

      if (event.type?.startsWith?.("response.output_text")) {
        logger.info("OpenAI Realtime text event", { type: event.type });
      }

      if (event.type === "response.done" && transcriptBuffer.length > 0) {
        const transcript = transcriptBuffer.trim();
        transcriptBuffer = "";
        if (transcript.length > 0) {
          onTranscript?.(transcript);
        }
      }
    } catch (error) {
      logger.warn("Failed to parse OpenAI Realtime message", error);
    }
  });

  ws.on("error", (error) => {
    logger.warn("OpenAI Realtime WebSocket error", error);
  });

  ws.on("close", (code, reason) => {
    logger.info("OpenAI Realtime WebSocket closed", { code, reason: reason.toString() });
  });

  const sendAudio = (base64Audio: string) => {
    if (!base64Audio) {
      return;
    }

    if (!isReady || ws.readyState !== WebSocket.OPEN) {
      pendingAudio.push(base64Audio);
      return;
    }

    ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: base64Audio }));
  };

  const close = () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };

  return { sendAudio, close };
};
