import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("twilio caller lookup service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("logs line type from lookup", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ line_type_intelligence: { type: "mobile" } }),
      }),
    );

    vi.resetModules();
    const { logger } = await import("../utils/logger");
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const { logIncomingCallerLineType } = await import("../services/twilioCallerLookupService");

    logIncomingCallerLineType({ from: "+15551234567" });
    await vi.runAllTimersAsync();

    expect(infoSpy).toHaveBeenCalledWith("Incoming caller line type", {
      from: "+15551234567",
      lineType: "mobile",
    });
  });

  it("logs unknown when lookup credentials are missing", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubGlobal("fetch", vi.fn());

    vi.resetModules();
    const { logger } = await import("../utils/logger");
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const { logIncomingCallerLineType } = await import("../services/twilioCallerLookupService");

    logIncomingCallerLineType({ from: "+15551234567" });
    await vi.runAllTimersAsync();

    expect(infoSpy).toHaveBeenCalledWith("Incoming caller line type", {
      from: "+15551234567",
      lineType: "unknown",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
