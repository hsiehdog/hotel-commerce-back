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

  it("returns structured generation response for valid payload", async () => {
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
    const payload = json.mock.calls[0]?.[0] as { data?: { status?: string; slots?: { check_in?: string | null } } };
    expect(payload.data?.status).toBe("NEEDS_CLARIFICATION");
    expect(payload.data?.slots?.check_in).toBe("2026-02-10");
  });
});
