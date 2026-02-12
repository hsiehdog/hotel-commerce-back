import { describe, expect, it } from "vitest";
import { createEmptyOfferIntent } from "../ai/offerIntent";
import { generateOffers } from "../services/offerGenerationService";

describe("offer generation service", () => {
  it("returns flexible and non-refundable offers after confirmation", async () => {
    const first = await generateOffers({
      currentIntent: createEmptyOfferIntent(),
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        pet_friendly: true,
        needs_two_beds: true,
      },
    });

    expect(first.status).toBe("NEEDS_CLARIFICATION");
    if (first.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    const second = await generateOffers({
      currentIntent: first.slots,
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        pet_friendly: true,
        needs_two_beds: true,
      },
    });

    expect(second.status).toBe("OK");
    if (second.status !== "OK") {
      return;
    }

    expect(second.offers).toHaveLength(2);
    const [flexible, saver] = second.offers;
    if (!flexible || !saver) {
      return;
    }

    expect(flexible.rate_type).toBe("flexible");
    expect(saver.rate_type).toBe("non_refundable");
  });

  it("returns clarification when no inventory is available", async () => {
    const first = await generateOffers({
      currentIntent: createEmptyOfferIntent(),
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 99,
      },
    });

    expect(first.status).toBe("NEEDS_CLARIFICATION");
    if (first.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    const second = await generateOffers({
      currentIntent: first.slots,
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 99,
      },
    });

    expect(second.status).toBe("NEEDS_CLARIFICATION");
    if (second.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    expect(second.clarificationPrompt).toMatch(/rooms cannot exceed total guests/i);
  });

  it("uses unified commerce selection behavior for saver_primary_accessible scenario", async () => {
    const first = await generateOffers({
      currentIntent: createEmptyOfferIntent(),
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        accessible_room: true,
        stub_scenario: "saver_primary_accessible",
      },
    });

    expect(first.status).toBe("NEEDS_CLARIFICATION");
    if (first.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    const second = await generateOffers({
      currentIntent: first.slots,
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        accessible_room: true,
        stub_scenario: "saver_primary_accessible",
      },
    });

    expect(second.status).toBe("OK");
    if (second.status !== "OK") {
      return;
    }

    expect(second.offers.length).toBeGreaterThanOrEqual(1);
    const [primary] = second.offers;
    if (!primary) {
      return;
    }

    expect(primary.rate_type).toBe("non_refundable");
    expect(primary.commerce_metadata?.saverPrimaryExceptionApplied).toBe(true);
  });

  it("drops mismatched-currency SAVER candidates and still returns two SAFE offers", async () => {
    const first = await generateOffers({
      currentIntent: createEmptyOfferIntent(),
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        stub_scenario: "currency_mismatch",
      },
    });

    expect(first.status).toBe("NEEDS_CLARIFICATION");
    if (first.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    const second = await generateOffers({
      currentIntent: first.slots,
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        stub_scenario: "currency_mismatch",
      },
    });

    expect(second.status).toBe("OK");
    if (second.status !== "OK") {
      return;
    }

    expect(second.offers).toHaveLength(2);
    expect(second.offers[0]?.rate_type).toBe("flexible");
    expect(second.offers[1]?.rate_type).toBe("flexible");
    expect(second.offers[0]?.price.currency).toBe("USD");
    expect(second.offers[1]?.price.currency).toBe("USD");
  });

  it("falls back safely when all pricing fields are invalid", async () => {
    const first = await generateOffers({
      currentIntent: createEmptyOfferIntent(),
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        stub_scenario: "invalid_pricing",
      },
    });

    expect(first.status).toBe("NEEDS_CLARIFICATION");
    if (first.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    const second = await generateOffers({
      currentIntent: first.slots,
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        stub_scenario: "invalid_pricing",
      },
    });

    expect(second.status).toBe("NEEDS_CLARIFICATION");
    if (second.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    expect(second.clarificationPrompt).toMatch(/trouble confirming pricing/i);
  });

  it("uses before-tax basis in degraded mode when taxes are unavailable", async () => {
    const first = await generateOffers({
      currentIntent: createEmptyOfferIntent(),
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        stub_scenario: "before_tax_only",
      },
    });

    expect(first.status).toBe("NEEDS_CLARIFICATION");
    if (first.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    const second = await generateOffers({
      currentIntent: first.slots,
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        stub_scenario: "before_tax_only",
      },
    });

    expect(second.status).toBe("OK");
    if (second.status !== "OK") {
      return;
    }

    expect(second.offers[0]?.commerce_metadata?.priceBasisUsed).toBe("beforeTax");
    expect(second.offers[0]?.commerce_metadata?.degradedPriceControls).toBe(true);
  });
});
