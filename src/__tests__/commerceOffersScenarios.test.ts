import { describe, expect, it, vi } from "vitest";
import { generateOffersForChannel } from "../controllers/offersController";

const createResponse = () =>
  ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }) as unknown as Parameters<typeof generateOffersForChannel>[1];

describe("commerce offers scenarios", () => {
  it("family scenario leads with SAFE and family enhancement", async () => {
    const req = {
      body: {
        property_id: "cb_123",
        channel: "voice",
        check_in: "2026-04-10",
        check_out: "2026-04-13",
        rooms: 1,
        adults: 2,
        children: 2,
        child_ages: [7, 10],
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as {
      data: {
        offers: Array<{ type: string; recommended: boolean; enhancements?: Array<{ availability: string }> }>;
        decisionTrace: string[];
      };
    };
    expect(payload.data.offers[0]?.type).toBe("SAFE");
    expect(payload.data.offers[0]?.recommended).toBe(true);
    expect(payload.data.offers[0]?.enhancements?.[0]?.availability).toBe("info");
    expect(payload.data.decisionTrace.some((line) => /secondary/i.test(line))).toBe(true);
  });

  it("compression weekend can flip primary to SAVER", async () => {
    const req = {
      body: {
        property_id: "cb_123",
        channel: "voice",
        check_in: "2026-05-22",
        check_out: "2026-05-25",
        rooms: 1,
        adults: 2,
        children: 0,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();
    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as {
      data: { offers: Array<{ type: string }>; decisionTrace: string[] };
    };
    expect(payload.data.offers[0]?.type).toBe("SAVER");
    expect(payload.data.decisionTrace.some((line) => /refundable primary/i.test(line))).toBe(false);
  });

  it("family trip adds family-fit enhancement", async () => {
    const req = {
      body: {
        property_id: "cb_123",
        channel: "voice",
        check_in: "2026-03-17",
        check_out: "2026-03-18",
        rooms: 1,
        adults: 2,
        children: 1,
        child_ages: [6],
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();
    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as {
      data: { offers: Array<{ enhancements?: Array<{ availability: string; disclosure?: string }> }> };
    };
    expect(payload.data.offers[0]?.enhancements?.[0]?.availability).toBe("info");
  });

  it("constraint weekend can still return two SAFE offers via same-archetype fallback", async () => {
    const req = {
      body: {
        property_id: "cb_123",
        channel: "voice",
        check_in: "2026-05-23",
        check_out: "2026-05-24",
        rooms: 1,
        adults: 2,
        children: 0,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();
    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as {
      data: { offers: Array<{ type: string }>; fallbackAction?: { type?: string; suggestions?: unknown[] } };
    };
    expect(payload.data.offers).toHaveLength(2);
    expect(payload.data.offers[0]?.type).toBe("SAFE");
    expect(payload.data.offers[1]?.type).toBe("SAFE");
    expect(payload.data.fallbackAction).toBeUndefined();
  });

  it("unknown property_id falls back to demo_property defaults", async () => {
    const req = {
      body: {
        property_id: "cb_999",
        channel: "voice",
        check_in: "2026-06-05",
        check_out: "2026-06-07",
        rooms: 1,
        adults: 2,
        currency: "USD",
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();
    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as {
      data: { propertyId: string; offers: Array<{ type: string }>; fallbackAction?: { type?: string } };
    };
    expect(payload.data.propertyId).toBe("demo_property");
    expect(payload.data.offers).toHaveLength(2);
    expect(payload.data.offers[0]?.type).toBe("SAFE");
    expect(payload.data.offers[1]?.type).toBe("SAVER");
    expect(payload.data.fallbackAction).toBeUndefined();
  });
});
