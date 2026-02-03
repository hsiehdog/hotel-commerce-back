import { handleTwilioStreamMessage, type TwilioStreamMessage } from "../services/twilioMediaStreamService";
import type { TwilioStreamAction } from "../services/twilioMediaStreamService";

type OrchestratorLike = {
  handleAction: (action: TwilioStreamAction) => void;
  state: { streamId?: string | undefined };
};

export const createFakeTwilioTransport = (orchestrator: OrchestratorLike) => {
  const connectionState: { callId?: string; streamId?: string } = {};
  const sentMedia: Array<{ streamSid: string; payload: string }> = [];

  const sendTwilioMessage = (message: TwilioStreamMessage) => {
    const action = handleTwilioStreamMessage(message, connectionState);
    if (!action) {
      return;
    }

    if (action.type === "start") {
      connectionState.streamId = action.streamId ?? connectionState.streamId;
      orchestrator.state.streamId = connectionState.streamId;
    }

    orchestrator.handleAction(action);
  };

  const recordOutboundAudio = (payload: string, streamId?: string) => {
    if (!streamId) {
      return;
    }

    sentMedia.push({ streamSid: streamId, payload });
  };

  return { sendTwilioMessage, recordOutboundAudio, sentMedia, connectionState };
};
