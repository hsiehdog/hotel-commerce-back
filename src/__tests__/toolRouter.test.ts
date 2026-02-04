import { describe, expect, it } from "vitest";
import { dispatchToolCall } from "../ai/toolRouter";
import { createEmptyOfferIntent } from "../ai/offerIntent";

describe("tool router offers", () => {
  it("returns flexible and non-refundable offers with pricing", () => {
    const session = { intent: createEmptyOfferIntent() };
    const result = dispatchToolCall({
      name: "get_offers",
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        pet_friendly: true,
        needs_two_beds: true,
      },
      session,
    });

    expect(result.status).toBe("NEEDS_CLARIFICATION");
    if (result.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    const confirmed = dispatchToolCall({
      name: "get_offers",
      args: {
        check_in: "2026-02-10",
        check_out: "2026-02-12",
        adults: 2,
        rooms: 1,
        pet_friendly: true,
        needs_two_beds: true,
      },
      session,
    });

    expect(confirmed.status).toBe("OK");
    if (confirmed.status !== "OK") {
      return;
    }

    expect(confirmed.offers).toHaveLength(2);
    const [flexible, saver] = confirmed.offers;
    if (!flexible || !saver) {
      return;
    }

    expect(flexible.rate_type).toBe("flexible");
    expect(flexible.payment_policy).toMatch(/pay when you arrive/i);
    expect(saver.rate_type).toBe("non_refundable");
    expect(saver.payment_policy).toMatch(/payment is due now/i);
    expect(saver.price.per_night).toBeLessThan(flexible.price.per_night);
  });
});
