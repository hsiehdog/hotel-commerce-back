import { describe, expect, it } from "vitest";
import type { RatePlanSnapshot, RoomTypeSnapshot } from "../ai/ariSnapshot";
import {
  canUseSaverPrimaryException,
  isPropertyOpenAt,
  resolveAttributedClick,
  resolvePlanPricing,
  withinPriceDeltaGuardrail,
} from "../services/commerce/commerceEvaluators";

const buildPlan = (pricing: RatePlanSnapshot["pricing"]): RatePlanSnapshot => ({
  ratePlanId: "RP_TEST",
  ratePlanName: "Test Plan",
  refundability: "REFUNDABLE",
  paymentTiming: "PAY_LATER",
  cancellationPolicy: {},
  pricing,
  restrictions: {},
});

describe("commerce evaluators", () => {
  it("resolves pricing hierarchy with strict fallback", () => {
    const afterTax = resolvePlanPricing(
      buildPlan({
        nightly: [],
        totalAfterTax: 220,
        totalBeforeTax: 200,
        taxesAndFees: 20,
      }),
    );
    expect(afterTax?.basis).toBe("afterTax");
    expect(afterTax?.total).toBe(220);

    const beforeTaxPlusFees = resolvePlanPricing(
      buildPlan({
        nightly: [],
        totalAfterTax: null,
        totalBeforeTax: 200,
        taxesAndFees: 20,
      }),
    );
    expect(beforeTaxPlusFees?.basis).toBe("beforeTaxPlusTaxes");
    expect(beforeTaxPlusFees?.total).toBe(220);

    const beforeTaxOnly = resolvePlanPricing(
      buildPlan({
        nightly: [],
        totalAfterTax: undefined,
        totalBeforeTax: 200,
        taxesAndFees: null,
      }),
    );
    expect(beforeTaxOnly?.basis).toBe("beforeTax");
    expect(beforeTaxOnly?.degradedPriceControls).toBe(true);

    const invalid = resolvePlanPricing(
      buildPlan({
        nightly: [],
        totalAfterTax: undefined,
        totalBeforeTax: undefined,
        taxesAndFees: undefined,
      }),
    );
    expect(invalid).toBeNull();
  });

  it("applies price delta guardrail by strategy", () => {
    expect(withinPriceDeltaGuardrail("protect_rate", 1200, 900)).toBe(false);
    expect(withinPriceDeltaGuardrail("balanced", 1200, 1000)).toBe(true);
    expect(withinPriceDeltaGuardrail("fill_rooms", 1200, 700)).toBe(false);
  });

  it("allows saver-primary exception only for compressed inventory and large delta", () => {
    const roomType: RoomTypeSnapshot = {
      roomTypeId: "RT_KING",
      roomTypeName: "King",
      maxOccupancy: 2,
      roomsAvailable: 2,
      totalInventory: 30,
      ratePlans: [],
    };

    expect(
      canUseSaverPrimaryException({
        roomType,
        refundableTotal: 1000,
        saverTotal: 600,
        shouldUseStrictPriceControls: true,
      }),
    ).toBe(true);

    expect(
      canUseSaverPrimaryException({
        roomType: { ...roomType, roomsAvailable: 8, totalInventory: 30 },
        refundableTotal: 1000,
        saverTotal: 600,
        shouldUseStrictPriceControls: true,
      }),
    ).toBe(false);
  });

  it("evaluates multi-interval and overnight business hours with previous-day carryover", () => {
    const intervals = [
      { dayOfWeek: 1, openTime: "22:00", closeTime: "06:00" },
      { dayOfWeek: 2, openTime: "09:00", closeTime: "12:00" },
      { dayOfWeek: 2, openTime: "14:00", closeTime: "18:00" },
    ];

    expect(
      isPropertyOpenAt({
        nowUtc: new Date("2026-02-10T01:00:00Z"),
        timezone: "UTC",
        intervals,
      }),
    ).toBe(true);

    expect(
      isPropertyOpenAt({
        nowUtc: new Date("2026-02-10T13:00:00Z"),
        timezone: "UTC",
        intervals,
      }),
    ).toBe(false);

    expect(
      isPropertyOpenAt({
        nowUtc: new Date("2026-02-10T15:00:00Z"),
        timezone: "UTC",
        intervals,
      }),
    ).toBe(true);
  });

  it("attributes booking to the last qualifying click within 24 hours", () => {
    const booking = {
      propertyId: "demo",
      bookedAt: new Date("2026-02-10T12:00:00Z"),
      checkIn: "2026-03-10",
      nights: 2,
      partySize: 2,
    };
    const clicks = [
      {
        callId: "a",
        quoteToken: "q1",
        propertyId: "demo",
        clickedAt: new Date("2026-02-10T08:00:00Z"),
        checkIn: "2026-03-10",
        nights: 2,
        partySize: 2,
      },
      {
        callId: "b",
        quoteToken: "q2",
        propertyId: "demo",
        clickedAt: new Date("2026-02-10T11:30:00Z"),
        checkIn: "2026-03-11",
        nights: 2,
        partySize: 2,
      },
    ];

    const matched = resolveAttributedClick({ booking, clicks });
    expect(matched?.callId).toBe("b");
    expect(matched?.quoteToken).toBe("q2");
  });
});
