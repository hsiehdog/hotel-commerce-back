import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { createVoiceOrchestrator } from "../services/voiceOrchestrator";
import { clearAllSessions } from "../services/twilioMediaStreamService";
import { createFakeRealtimeClientFactory } from "../testing/fakeRealtimeClient";
import { createFakeTwilioTransport } from "../testing/fakeTwilioTransport";

const setup = () => {
  const { factory, controller } = createFakeRealtimeClientFactory();
  const orchestrator = createVoiceOrchestrator({
    onOutboundAudio: () => {},
    realtimeFactory: factory,
  });
  const transport = createFakeTwilioTransport(orchestrator);

  transport.sendTwilioMessage({
    event: "start",
    start: { callSid: "CA123", streamSid: "MS123", from: "+15551234567" },
  });

  return { controller, transport, orchestrator };
};

const lastToolOutput = (controller: ReturnType<typeof createFakeRealtimeClientFactory>["controller"]) => {
  const last = controller.sentFunctionOutputs[controller.sentFunctionOutputs.length - 1];
  return last?.output as { status?: string; clarificationPrompt?: string; missingFields?: string[] } | undefined;
};

describe("voice orchestrator tool gating", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-03T20:00:00Z"));
    clearAllSessions();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns clarification for relative dates and then OK after clarification", async () => {
    const { controller } = setup();

    await controller.emitFunctionCall("get_offers", {
      check_in: "tomorrow",
      check_out: "in 2 days",
      adults: 2,
      rooms: 1,
    });

    const first = lastToolOutput(controller);
    expect(first?.status).toBe("NEEDS_CLARIFICATION");
    expect(first?.missingFields).toContain("check_in");
    expect(first?.clarificationPrompt).toMatch(/assuming/i);
    expect(controller.responseCreateCount).toBe(1);

    await controller.emitFunctionCall("get_offers", {
      check_in: "2026-02-04",
      check_out: "2026-02-05",
      adults: 2,
      rooms: 1,
    });

    const second = lastToolOutput(controller);
    expect(second?.status).toBe("NEEDS_CLARIFICATION");
    expect(second?.clarificationPrompt).toMatch(/confirm/i);
    expect(controller.responseCreateCount).toBe(2);

    await controller.emitFunctionCall("get_offers", {
      check_in: "2026-02-04",
      check_out: "2026-02-05",
      adults: 2,
      rooms: 1,
    });

    const third = lastToolOutput(controller);
    expect(third?.status).toBe("OK");
    expect(controller.responseCreateCount).toBe(3);
  });

  it("asks for missing check-out", async () => {
    const { controller } = setup();

    await controller.emitFunctionCall("get_offers", {
      check_in: "2026-03-12",
      adults: 2,
      rooms: 1,
    });

    const output = lastToolOutput(controller);
    expect(output?.status).toBe("NEEDS_CLARIFICATION");
    expect(output?.missingFields).toContain("check_out");
    expect(output?.clarificationPrompt).toMatch(/check-out date|nights/i);
  });

  it("asks to confirm when check-out is before check-in", async () => {
    const { controller } = setup();

    await controller.emitFunctionCall("get_offers", {
      check_in: "2026-03-14",
      check_out: "2026-03-12",
      adults: 2,
      rooms: 1,
    });

    const output = lastToolOutput(controller);
    expect(output?.status).toBe("NEEDS_CLARIFICATION");
    expect(output?.clarificationPrompt).toMatch(/check-in/i);
    expect(output?.clarificationPrompt).toMatch(/check-out/i);
  });

  it("normalizes weekend phrases and asks only the standard recap confirmation", async () => {
    const { controller } = setup();

    await controller.emitFunctionCall("get_offers", {
      check_in: "this weekend",
      check_out: "next weekend",
      adults: 2,
      rooms: 1,
    });

    const output = lastToolOutput(controller);
    expect(output?.status).toBe("NEEDS_CLARIFICATION");
    expect(output?.clarificationPrompt).toMatch(/Just to confirm/i);
    expect(output?.clarificationPrompt).toMatch(/Is this correct\?/i);
    expect(output?.clarificationPrompt).not.toMatch(/friday to sunday/i);
    expect(output?.clarificationPrompt).not.toMatch(/saturday to monday/i);
  });

  it("handles happy-path get_offers tool call", async () => {
    const { controller } = setup();

    await controller.emitFunctionCall(
      "get_offers",
      {
        check_in: "2026-02-03",
        check_out: "2026-02-05",
        adults: 2,
        rooms: 1,
      },
      "call_1",
    );

    expect(controller.sentFunctionOutputs).toHaveLength(1);
    expect(controller.responseCreateCount).toBe(1);
    expect(lastToolOutput(controller)?.status).toBe("NEEDS_CLARIFICATION");

    await controller.emitFunctionCall(
      "get_offers",
      {
        check_in: "2026-02-03",
        check_out: "2026-02-05",
        adults: 2,
        rooms: 1,
      },
      "call_2",
    );

    expect(controller.sentFunctionOutputs).toHaveLength(2);
    expect(controller.responseCreateCount).toBe(2);
    expect(lastToolOutput(controller)?.status).toBe("OK");
  });

  it("injects trusted day/date context into realtime instructions", () => {
    vi.setSystemTime(new Date("2026-02-13T20:00:00Z"));
    const { controller } = setup();
    expect(controller.instructions).toContain("Friday, February 13, 2026");
    expect(controller.instructions).toContain("Do not state a different current day/date");
    expect(controller.instructions).toContain("Never resolve relative dates yourself");
  });
});
