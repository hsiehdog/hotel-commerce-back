import { dispatchToolCall } from "../ai/toolRouter";
import { createOpenAiRealtimeClient } from "../integrations/openaiRealtimeClient";
import type { RealtimeClient, RealtimeClientOptions } from "../integrations/openaiRealtimeClient";
import { buildTwilioOffersPrompt } from "../prompts/system/twilioOffersPrompt";
import { getSession } from "./twilioMediaStreamService";
import { logger } from "../utils/logger";
import type { TwilioStreamAction } from "./twilioMediaStreamService";

type OrchestratorOptions = {
  onOutboundAudio: (base64Audio: string, streamId?: string) => void;
  onSessionStarted?: (callId: string) => void;
  realtimeFactory?: (options: RealtimeClientOptions) => RealtimeClient;
};

type OrchestratorState = {
  callId?: string;
  streamId?: string;
  greeted: boolean;
  realtime?: RealtimeClient;
};

export const createVoiceOrchestrator = ({
  onOutboundAudio,
  onSessionStarted,
  realtimeFactory,
}: OrchestratorOptions) => {
  const state: OrchestratorState = { greeted: false };
  const propertyTimezone = "America/Los_Angeles";
  const buildRealtime = (now: Date) =>
    (realtimeFactory ?? createOpenAiRealtimeClient)({
      instructions: buildTwilioOffersPrompt(now, propertyTimezone),
      tools: [
        {
          name: "get_offers",
          description:
            "Get hotel offers after all required slots are provided and unambiguous: check_in, check_out or nights, adults, rooms.",
          parameters: {
            type: "object",
            additionalProperties: false,
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
              parking_needed: { type: "boolean", description: "Whether parking is needed." },
              breakfast_package: { type: "boolean", description: "Whether a breakfast package add-on is needed." },
              early_check_in: { type: "boolean", description: "Whether early check-in add-on is needed." },
              late_check_out: { type: "boolean", description: "Whether late check-out add-on is needed." },
            },
            required: [],
          },
        },
      ],
      onAudioDelta: (base64Audio) => {
        if (!state.streamId) {
          return;
        }

        onOutboundAudio(base64Audio, state.streamId);
      },
      onTranscript: (text) => {
        logger.info("OpenAI Realtime transcript", { callId: state.callId, text });
      },
      onFunctionCall: async ({ name, callId, arguments: args }) => {
        const session = state.callId ? getSession(state.callId) : undefined;
        const result = await dispatchToolCall({ name, args, session, now: new Date() });
        state.realtime?.sendFunctionCallOutput(callId, result);
        state.realtime?.requestResponse();
      },
    });

  const ensureRealtime = (now: Date) => {
    if (!state.realtime) {
      state.realtime = buildRealtime(now);
    }
    return state.realtime;
  };

  const handleAction = (action: TwilioStreamAction) => {
    if (action.type === "start") {
      state.callId = action.callId;
      state.streamId = action.streamId ?? state.streamId;
      const session = getSession(action.callId);
      const trustedNow = session?.createdAt ?? new Date();
      const realtime = ensureRealtime(trustedNow);
      onSessionStarted?.(action.callId);
      if (!state.greeted) {
        state.greeted = true;
        realtime.sendAssistantMessage("Hi! I can help with booking a room. What dates are you looking for?");
      }
      return;
    }

    if (action.type === "media") {
      state.realtime?.sendAudio(action.payload);
      return;
    }

    if (action.type === "stop") {
      state.realtime?.close();
      state.realtime = undefined;
    }
  };

  const close = () => {
    state.realtime?.close();
    state.realtime = undefined;
  };

  return { handleAction, close, state };
};
