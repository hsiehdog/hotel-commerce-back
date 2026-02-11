import { describe, expect, it, vi } from "vitest";
import { generateOffersForChannel } from "../controllers/offersController";

const createResponse = () =>
  ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }) as unknown as Parameters<typeof generateOffersForChannel>[1];

type OfferResponsePayload = {
  data: {
    priceBasisUsed: "afterTax" | "beforeTaxPlusTaxes" | "beforeTax";
    offers: Array<{
      type: "SAFE" | "SAVER";
      recommended: boolean;
      pricing?: { basis?: string; total?: number; totalAfterTax?: number };
      enhancements?: Array<{ availability: string; disclosure?: string }>;
    }>;
    fallbackAction?: { type?: string } | null;
    debug?: {
      profileFinal?: { inventoryState?: string };
      reasonCodes?: string[];
      selectionSummary?: {
        saverPrimaryExceptionApplied?: boolean;
        secondaryFailureReason?: string | null;
      };
      resolvedRequest?: {
        roomOccupancies?: Array<{ adults: number; children: number }>;
      };
      topCandidates?: Array<{
        basis: string;
        roomTypeName?: string;
        roomTypeDescription?: string;
        features?: string[];
      }>;
    };
  };
};

describe("commerce decision engine coverage", () => {
  it("normal case returns SAFE + SAVER with no fallback", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "voice",
        stub_scenario: "default",
        check_in: "2026-04-10",
        check_out: "2026-04-13",
        rooms: 1,
        adults: 2,
        currency: "USD",
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    expect(payload.data.offers).toHaveLength(2);
    expect(payload.data.offers[0]?.type).toBe("SAFE");
    expect(payload.data.offers[0]?.recommended).toBe(true);
    expect(payload.data.offers[1]?.type).toBe("SAVER");
    expect(payload.data.fallbackAction).toBeUndefined();
    expect(payload.data.debug?.reasonCodes).toContain("SELECT_PRIMARY_SAFE");
    expect(payload.data.debug?.reasonCodes).toContain("SELECT_SECONDARY_SAVER");
    expect(payload.data.debug?.profileFinal?.inventoryState).toBe("normal");
    expect(payload.data.debug?.topCandidates?.[0]?.roomTypeName).toBeTruthy();
    expect(payload.data.debug?.topCandidates?.[0]?.roomTypeDescription).toBeTruthy();
    expect((payload.data.debug?.topCandidates?.[0]?.features?.length ?? 0) > 0).toBe(true);
  });

  it("saver-primary exception triggers under low inventory and can leave 1 offer", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "voice",
        stub_scenario: "saver_primary_accessible",
        check_in: "2026-05-22",
        check_out: "2026-05-25",
        rooms: 1,
        adults: 2,
        currency: "USD",
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    expect(payload.data.offers).toHaveLength(1);
    expect(payload.data.offers[0]?.type).toBe("SAVER");
    expect(payload.data.offers[0]?.recommended).toBe(true);
    expect(payload.data.debug?.selectionSummary?.saverPrimaryExceptionApplied).toBe(true);
    expect(payload.data.debug?.selectionSummary?.secondaryFailureReason).toBe(
      "SECONDARY_REJECTED_PRICE_SPREAD_GUARDRAIL",
    );
    expect(payload.data.fallbackAction?.type).toBe("text_booking_link");
    expect(payload.data.debug?.reasonCodes).toContain("SELECT_PRIMARY_SAVER_EXCEPTION_LOW_INVENTORY");
  });

  it("currency mismatch filters non-matching candidates and falls back", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "voice",
        stub_scenario: "currency_mismatch",
        check_in: "2026-06-05",
        check_out: "2026-06-07",
        rooms: 1,
        adults: 2,
        currency: "USD",
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    expect(payload.data.offers[0]?.type).toBe("SAFE");
    expect(payload.data.debug?.selectionSummary?.secondaryFailureReason).toBe(
      "SECONDARY_POOL_EMPTY_OPPOSITE_ARCHETYPE",
    );
    expect(payload.data.fallbackAction?.type).toBe("text_booking_link");
    expect(payload.data.debug?.reasonCodes).toContain("FILTER_CURRENCY_MISMATCH");
    expect(payload.data.debug?.reasonCodes).toContain("FALLBACK_TEXT_LINK");
  });

  it("before-tax-only scenario falls back to beforeTax basis group", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "voice",
        stub_scenario: "before_tax_only",
        check_in: "2026-03-12",
        check_out: "2026-03-15",
        rooms: 1,
        adults: 2,
        currency: "USD",
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    expect(payload.data.priceBasisUsed).toBe("beforeTax");
    expect(payload.data.offers).toHaveLength(2);
    expect(payload.data.offers[0]?.type).toBe("SAFE");
    expect(payload.data.offers[1]?.type).toBe("SAVER");
    expect(payload.data.debug?.topCandidates?.every((candidate) => candidate.basis === "beforeTax")).toBe(true);
    const pricing = payload.data.offers[0]?.pricing as { basis?: string; total?: number; totalAfterTax?: number };
    expect(pricing?.basis).toBe("beforeTax");
    expect(typeof pricing?.total).toBe("number");
    expect(pricing?.totalAfterTax).toBeUndefined();
  });

  it("restriction scenario filters candidates and uses fallback matrix", async () => {
    const req = {
      body: {
        check_in: "2026-05-23",
        check_out: "2026-05-24",
        adults: 2,
        rooms: 1,
        stub_scenario: "constraint_min_los",
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    expect(payload.data.offers.length).toBeLessThanOrEqual(1);
    expect(payload.data.debug?.reasonCodes).toContain("FILTER_RESTRICTIONS");
    expect(payload.data.debug?.selectionSummary?.secondaryFailureReason).toBe(
      "SECONDARY_POOL_EMPTY_OPPOSITE_ARCHETYPE",
    );
    expect(payload.data.fallbackAction?.type).toBe("text_booking_link");
  });

  it("bonus: occupancy normalization distributes guests for multi-room requests", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "voice",
        stub_scenario: "default",
        check_in: "2026-04-10",
        check_out: "2026-04-13",
        rooms: 2,
        adults: 4,
        currency: "USD",
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    const roomOccupancies = payload.data.debug?.resolvedRequest?.roomOccupancies ?? [];
    expect(payload.data.debug?.reasonCodes).toContain("NORMALIZE_OCCUPANCY_DISTRIBUTED");
    expect(roomOccupancies.length).toBe(2);
    expect(roomOccupancies.every((room) => room.adults + room.children > 0)).toBe(true);
  });

  it("bonus: enhancement attachment includes request-only disclosure", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "voice",
        stub_scenario: "default",
        check_in: "2026-02-12",
        check_out: "2026-02-15",
        rooms: 2,
        adults: 4,
        currency: "USD",
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    const enhancement = payload.data.offers[0]?.enhancements?.[0];
    expect(payload.data.debug?.reasonCodes).toContain("ENHANCEMENT_ATTACHED");
    expect(enhancement?.availability).toBe("request");
    expect(enhancement?.disclosure).toMatch(/subject to availability/i);
  });
});
