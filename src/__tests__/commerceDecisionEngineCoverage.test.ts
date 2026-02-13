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
      roomsAvailable?: number;
      pricing?: {
        basis?: string;
        total?: number;
        totalAfterTax?: number;
        breakdown?: {
          baseRateSubtotal?: number | null;
          taxesAndFees?: number | null;
          includedFees?: {
            nights?: number;
            petFeePerNight?: number | null;
            parkingFeePerNight?: number | null;
            petFeeTotal?: number | null;
            parkingFeeTotal?: number | null;
            totalIncludedFees?: number | null;
          };
        };
      };
      enhancements?: Array<{ id?: string; availability: string; disclosure?: string }>;
    }>;
    fallbackAction?: { type?: string } | null;
    debug?: {
      reasonCodes?: string[];
      scoring?: {
        weights?: {
          value?: number;
          conversion?: number;
          experience?: number;
          margin?: number;
          risk?: number;
        };
      };
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
    const weights = payload.data.debug?.scoring?.weights;
    expect(weights).toBeTruthy();
    expect((weights?.value ?? 0) + (weights?.conversion ?? 0) + (weights?.experience ?? 0) + (weights?.margin ?? 0)).toBeCloseTo(1, 3);
    expect(weights?.risk).toBeGreaterThanOrEqual(0.05);
    expect(weights?.risk).toBeLessThanOrEqual(0.35);
    expect(payload.data.offers[0]?.roomsAvailable).toBeTypeOf("number");
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
    expect(payload.data.offers.length).toBeGreaterThanOrEqual(1);
    expect(payload.data.offers.length).toBeLessThanOrEqual(2);
    expect(payload.data.offers[0]?.type).toBe("SAVER");
    expect(payload.data.offers[0]?.recommended).toBe(true);
    expect(payload.data.debug?.selectionSummary?.saverPrimaryExceptionApplied).toBe(true);
    if (payload.data.offers.length === 1) {
      expect(payload.data.debug?.selectionSummary?.secondaryFailureReason).toBe(
        "SECONDARY_REJECTED_PRICE_SPREAD_GUARDRAIL",
      );
      expect(payload.data.fallbackAction?.type).toBe("suggest_alternate_dates");
    }
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
    expect(payload.data.offers).toHaveLength(2);
    expect(payload.data.offers[0]?.type).toBe("SAFE");
    expect(payload.data.offers[1]?.type).toBe("SAFE");
    expect(payload.data.debug?.selectionSummary?.secondaryFailureReason).toBeNull();
    expect(payload.data.fallbackAction).toBeUndefined();
    expect(payload.data.debug?.reasonCodes).toContain("FILTER_CURRENCY_MISMATCH");
    expect(payload.data.debug?.reasonCodes).toContain("SECONDARY_POOL_EMPTY_OPPOSITE_ARCHETYPE");
    expect(payload.data.debug?.reasonCodes).toContain("SECONDARY_SAME_ARCHETYPE_FALLBACK");
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

  it("restriction scenario can fall back to same-archetype secondary when opposite archetype is filtered out", async () => {
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
    expect(payload.data.offers).toHaveLength(2);
    expect(payload.data.debug?.reasonCodes).toContain("FILTER_RESTRICTIONS");
    expect(payload.data.debug?.reasonCodes).toContain("SECONDARY_POOL_EMPTY_OPPOSITE_ARCHETYPE");
    expect(payload.data.debug?.reasonCodes).toContain("SECONDARY_SAME_ARCHETYPE_FALLBACK");
    expect(payload.data.debug?.selectionSummary?.secondaryFailureReason).toBeNull();
    expect(payload.data.fallbackAction).toBeUndefined();
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

  it("bonus: enhancement attachment includes contextual enhancement", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "voice",
        stub_scenario: "default",
        check_in: "2026-02-12",
        check_out: "2026-02-15",
        rooms: 2,
        adults: 4,
        parking_needed: true,
        currency: "USD",
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    const enhancement = payload.data.offers[0]?.enhancements?.find((item) => item.id === "addon_parking");
    expect(payload.data.debug?.reasonCodes).toContain("ENHANCEMENT_ATTACHED");
    expect(enhancement?.availability).toBe("info");
    expect(enhancement?.disclosure).toMatch(/parking request noted/i);
  });

  it("filters to accessible room types when accessible_room is requested", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "voice",
        check_in: "2026-04-10",
        check_out: "2026-04-12",
        rooms: 1,
        adults: 2,
        accessible_room: true,
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    const roomNames = payload.data.debug?.topCandidates?.map((candidate) => candidate.roomTypeName ?? "") ?? [];
    expect(roomNames.length).toBeGreaterThan(0);
    expect(roomNames.every((name) => name.toLowerCase().includes("accessible"))).toBe(true);
  });

  it("filters to two-bed room types and adds parking enhancement when requested", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "voice",
        check_in: "2026-04-10",
        check_out: "2026-04-12",
        rooms: 1,
        adults: 2,
        needs_two_beds: true,
        parking_needed: true,
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    const roomNames = payload.data.debug?.topCandidates?.map((candidate) => candidate.roomTypeName ?? "") ?? [];
    expect(roomNames.length).toBeGreaterThan(0);
    expect(roomNames.every((name) => name.toLowerCase().includes("queen"))).toBe(true);
    const parkingEnhancement = payload.data.offers[0]?.enhancements?.find((item) => item.id === "addon_parking");
    expect(parkingEnhancement).toBeTruthy();
  });

  it("adds pricing breakdown for included pet and parking fees", async () => {
    const req = {
      body: {
        property_id: "inn_at_mount_shasta",
        channel: "web",
        check_in: "2026-02-21",
        check_out: "2026-02-23",
        rooms: 1,
        adults: 2,
        pet_friendly: true,
        parking_needed: true,
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    const breakdown = payload.data.offers[0]?.pricing?.breakdown;
    const includedFees = breakdown?.includedFees;
    expect(typeof breakdown?.baseRateSubtotal).toBe("number");
    expect(typeof breakdown?.taxesAndFees).toBe("number");
    expect(includedFees?.nights).toBe(2);
    expect(includedFees?.petFeePerNight).toBe(25);
    expect(includedFees?.parkingFeePerNight).toBe(15);
    expect(includedFees?.petFeeTotal).toBe(50);
    expect(includedFees?.parkingFeeTotal).toBe(30);
    expect(includedFees?.totalIncludedFees).toBe(80);
    const recomposedTotal = round2(
      (breakdown?.baseRateSubtotal ?? 0) +
        (breakdown?.taxesAndFees ?? 0) +
        (includedFees?.totalIncludedFees ?? 0),
    );
    expect(recomposedTotal).toBe(payload.data.offers[0]?.pricing?.totalAfterTax);
    const firstEnhancementIds = (payload.data.offers[0]?.enhancements ?? []).map((item) => item.id);
    const secondEnhancementIds = (payload.data.offers[1]?.enhancements ?? []).map((item) => item.id);
    expect(firstEnhancementIds).toContain("fee_pet_per_night");
    expect(firstEnhancementIds).toContain("addon_parking");
    expect(secondEnhancementIds).toContain("fee_pet_per_night");
    expect(secondEnhancementIds).toContain("addon_parking");
  });

  it("keeps pricing breakdown balanced for multi-room requests", async () => {
    const req = {
      body: {
        property_id: "demo_property",
        channel: "web",
        check_in: "2026-02-26",
        check_out: "2026-02-28",
        rooms: 2,
        adults: 2,
        children: 0,
        child_ages: [],
        roomOccupancies: [
          { adults: 1, children: 0 },
          { adults: 1, children: 0 },
        ],
        debug: true,
      },
    } as Parameters<typeof generateOffersForChannel>[0];
    const res = createResponse();
    const next = vi.fn();

    await generateOffersForChannel(req, res, next as Parameters<typeof generateOffersForChannel>[2]);
    expect(next).not.toHaveBeenCalled();

    const payload = (res as unknown as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0]?.[0] as OfferResponsePayload;
    const pricing = payload.data.offers[0]?.pricing;
    const breakdown = pricing?.breakdown;
    expect(breakdown?.baseRateSubtotal).toBe(446);
    expect(breakdown?.taxesAndFees).toBe(53.52);
    expect(breakdown?.includedFees?.totalIncludedFees).toBe(0);
    const recomposedTotal = round2(
      (breakdown?.baseRateSubtotal ?? 0) +
        (breakdown?.taxesAndFees ?? 0) +
        (breakdown?.includedFees?.totalIncludedFees ?? 0),
    );
    expect(recomposedTotal).toBe(pricing?.totalAfterTax);
  });

});

const round2 = (value: number): number => Math.round(value * 100) / 100;
