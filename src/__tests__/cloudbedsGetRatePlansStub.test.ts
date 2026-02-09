import { describe, expect, it } from "vitest";
import { getRatePlansStub } from "../integrations/cloudbeds/cloudbedsGetRatePlansStub";

describe("cloudbeds getRatePlans stub", () => {
  it("returns docs-like room and rate plan structure", () => {
    const response = getRatePlansStub({
      propertyId: "demo_property",
      checkIn: "2026-02-10",
      checkOut: "2026-02-12",
      adults: 2,
      rooms: 1,
      currency: "USD",
    });

    const room = response.roomTypes[0];
    const plan = room?.ratePlans[0];
    expect(room?.roomTypeID).toBeTruthy();
    expect(plan?.ratePlanID).toBeTruthy();
    expect(plan?.ratePlanNamePublic).toBeTruthy();
    expect(plan?.detailedRates.length).toBeGreaterThan(0);
  });

  it("supports scenario mutations for currency mismatch and invalid pricing", () => {
    const currencyMismatch = getRatePlansStub({
      propertyId: "demo_property",
      checkIn: "2026-02-10",
      checkOut: "2026-02-12",
      adults: 2,
      rooms: 1,
      currency: "USD",
      scenario: "currency_mismatch",
    });
    const mismatchPlan = currencyMismatch.roomTypes[0]?.ratePlans[1];
    expect(mismatchPlan?.currency).toBe("EUR");

    const invalidPricing = getRatePlansStub({
      propertyId: "demo_property",
      checkIn: "2026-02-10",
      checkOut: "2026-02-12",
      adults: 2,
      rooms: 1,
      currency: "USD",
      scenario: "invalid_pricing",
    });
    const invalidPlan = invalidPricing.roomTypes[0]?.ratePlans[0];
    expect(invalidPlan?.totalAfterTax).toBeNull();
    expect(invalidPlan?.totalRate).toBeNull();
  });
});
