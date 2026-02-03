import WebSocket, { RawData } from "ws";
import env from "../config/env";
import { logger } from "../utils/logger";

export type RealtimeClientOptions = {
  instructions: string;
  onAudioDelta: (base64Audio: string) => void;
  onTranscript?: (text: string) => void;
  onFunctionCall?: (payload: { name: string; callId: string; arguments: unknown }) => void;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
};

export type RealtimeClient = {
  sendAudio: (base64Audio: string) => void;
  sendFunctionCallOutput: (callId: string, output: unknown) => void;
  requestResponse: () => void;
  sendAssistantMessage: (text: string) => void;
  close: () => void;
};

const DEFAULT_MODEL = "gpt-realtime";
const DEFAULT_VOICE = "marin";

const buildRealtimeUrl = (model: string): string => {
  const url = new URL("wss://api.openai.com/v1/realtime");
  url.searchParams.set("model", model);
  return url.toString();
};

const buildSessionUpdate = (
  instructions: string,
  voice: string,
  tools: RealtimeClientOptions["tools"],
  transcriptionModel?: string,
) => ({
  type: "session.update",
  session: {
    type: "realtime",
    instructions,
    output_modalities: ["audio"],
    tools: tools?.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
    tool_choice: tools && tools.length > 0 ? "auto" : undefined,
    audio: {
      input: {
        format: {
          type: "audio/pcmu",
        },
        turn_detection: {
          type: "server_vad",
        },
        transcription: transcriptionModel
          ? {
              model: transcriptionModel,
              language: "en",
            }
          : undefined,
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
  onFunctionCall,
  tools,
}: RealtimeClientOptions): RealtimeClient => {
  const model = env.OPENAI_REALTIME_MODEL ?? DEFAULT_MODEL;
  const voice = env.OPENAI_REALTIME_VOICE ?? DEFAULT_VOICE;
  const transcriptionModel = env.OPENAI_REALTIME_TRANSCRIBE_MODEL;
  const url = buildRealtimeUrl(model);

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
  });

  const pendingAudio: string[] = [];
  const pendingAssistantMessages: string[] = [];
  let isReady = false;

  const flushPending = () => {
    while (pendingAudio.length > 0 && ws.readyState === WebSocket.OPEN) {
      const audio = pendingAudio.shift();
      if (audio) {
        ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
      }
    }

    while (pendingAssistantMessages.length > 0 && ws.readyState === WebSocket.OPEN) {
      const message = pendingAssistantMessages.shift();
      if (message) {
        sendOutOfBandResponse(message);
      }
    }
  };

  ws.on("open", () => {
    ws.send(JSON.stringify(buildSessionUpdate(instructions, voice, tools, transcriptionModel)));
    isReady = true;
    flushPending();
  });

  const eventHandlers = buildEventHandlers({
    onAudioDelta,
    onTranscript,
    onFunctionCall,
    onSessionUpdated: () => logger.info("OpenAI Realtime session updated"),
    onError: (event) => logger.warn("OpenAI Realtime error", event),
  });

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
      const handler = event.type ? eventHandlers[event.type] : undefined;
      if (handler) {
        handler(event);
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

  const sendFunctionCallOutput = (callId: string, output: unknown) => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output ?? {}),
        },
      }),
    );
  };

  const requestResponse = () => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(JSON.stringify({ type: "response.create" }));
  };

  const sendAssistantMessage = (text: string) => {
    if (!text) {
      return;
    }

    if (!isReady || ws.readyState !== WebSocket.OPEN) {
      pendingAssistantMessages.push(text);
      return;
    }

    sendOutOfBandResponse(text);
  };

  const sendOutOfBandResponse = (text: string) => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(
      JSON.stringify({
        type: "response.create",
        response: {
          conversation: "none",
          instructions: `Say exactly: ${text}`,
          output_modalities: ["audio"],
        },
      }),
    );
  };

  const close = () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };

  return { sendAudio, sendFunctionCallOutput, requestResponse, sendAssistantMessage, close };
};

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch (error) {
    logger.warn("Failed to parse function call arguments", error);
    return null;
  }
};

type RealtimeEvent = { type?: string; delta?: string; [key: string]: unknown };

type EventHandlers = Record<string, (event: RealtimeEvent) => void>;

const buildEventHandlers = (handlers: {
  onAudioDelta: (audio: string) => void;
  onTranscript?: (text: string) => void;
  onFunctionCall?: (payload: { name: string; callId: string; arguments: unknown }) => void;
  onSessionUpdated: () => void;
  onError: (event: RealtimeEvent) => void;
}): EventHandlers => {
  let transcriptBuffer = "";

  return {
    "session.updated": () => handlers.onSessionUpdated(),
    error: (event) => handlers.onError(event),
    "response.output_audio.delta": (event) => {
      if (typeof event.delta === "string") {
        handlers.onAudioDelta(event.delta);
      }
    },
    "response.audio.delta": (event) => {
      if (typeof event.delta === "string") {
        handlers.onAudioDelta(event.delta);
      }
    },
    "response.output_text.delta": (event) => {
      if (typeof event.delta === "string") {
        transcriptBuffer += event.delta;
      }
    },
    "response.done": () => {
      if (transcriptBuffer.length > 0) {
        const transcript = transcriptBuffer.trim();
        transcriptBuffer = "";
        if (transcript.length > 0) {
          handlers.onTranscript?.(transcript);
        }
      }
    },
    "conversation.item.input_audio_transcription.completed": (event) => {
      const transcript = typeof event.transcript === "string" ? event.transcript.trim() : "";
      if (transcript.length > 0) {
        handlers.onTranscript?.(transcript);
      }
    },
    "conversation.item.created": (event) => {
      const item = event.item as { type?: string; name?: string; call_id?: string; arguments?: string };
      if (item?.type === "function_call" && item.name && item.call_id) {
        const parsedArgs = item.arguments ? safeJsonParse(item.arguments) : null;
        handlers.onFunctionCall?.({ name: item.name, callId: item.call_id, arguments: parsedArgs });
      }
    },
    "response.function_call_arguments.done": (event) => {
      const callId = typeof event.call_id === "string" ? event.call_id : null;
      const name = typeof event.name === "string" ? event.name : null;
      const args = typeof event.arguments === "string" ? safeJsonParse(event.arguments) : null;
      if (callId && name) {
        handlers.onFunctionCall?.({ name, callId, arguments: args });
      }
    },
  };
};
