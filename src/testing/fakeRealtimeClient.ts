import type { RealtimeClientOptions } from "../integrations/openaiRealtimeClient";
import type { RealtimeClient } from "../integrations/openaiRealtimeClient";

export type FakeRealtimeController = {
  emitFunctionCall: (name: string, args: unknown, callId?: string) => Promise<void>;
  emitTranscript: (text: string) => void;
  sentFunctionOutputs: Array<{ callId: string; output: unknown }>;
  responseCreateCount: number;
  assistantMessages: string[];
  inputAudio: string[];
  isClosed: boolean;
  instructions: string | null;
};

export const createFakeRealtimeClientFactory = (): {
  factory: (options: RealtimeClientOptions) => RealtimeClient;
  controller: FakeRealtimeController;
} => {
  let options: RealtimeClientOptions | null = null;
  const controller: FakeRealtimeController = {
    sentFunctionOutputs: [],
    responseCreateCount: 0,
    assistantMessages: [],
    inputAudio: [],
    isClosed: false,
    instructions: null,
    emitFunctionCall: async (name, args, callId = "call_fake") => {
      await options?.onFunctionCall?.({ name, callId, arguments: args });
    },
    emitTranscript: (text) => {
      options?.onTranscript?.(text);
    },
  };

  const factory = (nextOptions: RealtimeClientOptions): RealtimeClient => {
    options = nextOptions;
    controller.instructions = nextOptions.instructions;

    return {
      sendAudio: (audio) => {
        controller.inputAudio.push(audio);
      },
      sendFunctionCallOutput: (callId, output) => {
        controller.sentFunctionOutputs.push({ callId, output });
      },
      requestResponse: () => {
        controller.responseCreateCount += 1;
      },
      sendAssistantMessage: (text) => {
        if (text) {
          controller.assistantMessages.push(text);
        }
      },
      close: () => {
        controller.isClosed = true;
      },
    };
  };

  return { factory, controller };
};
