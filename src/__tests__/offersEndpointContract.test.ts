import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/authMiddleware";
import { generateOffersForChannel } from "../controllers/offersController";

const createResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
};

describe("offers endpoint contract", () => {
  it("returns 401 via requireAuth when unauthenticated", () => {
    const req = {} as Parameters<typeof requireAuth>[0];
    const res = createResponse() as unknown as Parameters<typeof requireAuth>[1];
    const next = vi.fn();

    requireAuth(req, res, next as Parameters<typeof requireAuth>[2]);

    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(401);
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      message: "Unauthorized",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes ApiError(400) to next for invalid request body", async () => {
    const req = {
      body: {
        slots: {
          rooms: 0,
        },
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse() as unknown as Parameters<typeof generateOffersForChannel>[1];
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(400);
    expect((error as ApiError).message).toBe("Invalid request body");
  });

  it("returns structured commerce response for valid payload", async () => {
    const req = {
      body: {
        slots: {
          check_in: "2026-02-10",
          check_out: "2026-02-12",
          adults: 2,
          rooms: 1,
        },
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse() as unknown as Parameters<typeof generateOffersForChannel>[1];
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);

    expect(next).not.toHaveBeenCalled();
    const json = (res as unknown as { json: ReturnType<typeof vi.fn> }).json;
    expect(json).toHaveBeenCalledTimes(1);
    const payload = json.mock.calls[0]?.[0] as { data?: { currency?: string; offers?: Array<{ recommended?: boolean }> } };
    expect(payload.data?.currency).toBe("USD");
    expect(payload.data?.offers?.[0]?.recommended).toBe(true);
  });

  it("accepts top-level commerce request shape", async () => {
    const req = {
      body: {
        property_id: "cb_123",
        channel: "voice",
        check_in: "2026-04-10",
        check_out: "2026-04-13",
        adults: 2,
        children: 2,
        rooms: 1,
        preferences: { needs_space: true },
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse() as unknown as Parameters<typeof generateOffersForChannel>[1];
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);

    expect(next).not.toHaveBeenCalled();
    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as {
      data?: { offers?: Array<{ enhancements?: Array<{ whyShown?: string }> }> };
    };
    expect(payload.data?.offers?.[0]?.enhancements?.[0]?.whyShown).toBe("family_fit");
  });

  it("distributes occupancy across rooms when roomOccupancies are omitted", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "voice",
        check_in: "2026-02-12",
        check_out: "2026-02-15",
        adults: 4,
        rooms: 2,
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse() as unknown as Parameters<typeof generateOffersForChannel>[1];
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);

    expect(next).not.toHaveBeenCalled();
    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as {
      data?: {
        debug?: { resolvedRequest?: { roomOccupancies?: Array<{ adults: number; children: number }> } };
        decisionTrace?: string[];
      };
    };
    expect(payload.data?.debug?.resolvedRequest?.roomOccupancies).toEqual([
      { adults: 2, children: 0 },
      { adults: 2, children: 0 },
    ]);
    expect(payload.data?.decisionTrace?.some((line) => /Distributed guest occupancy across rooms/i.test(line))).toBe(true);
  });

  it("passes ApiError(422) when required slot data is missing", async () => {
    const req = {
      body: {
        slots: {
          check_in: "2026-03-12",
          adults: 2,
          rooms: 1,
        },
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse() as unknown as Parameters<typeof generateOffersForChannel>[1];
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(422);
    expect((error as ApiError).message).toMatch(/check-out date|nights/i);
  });
});
