import { describe, expect, it } from "vitest";
import { resolveOfferSlots } from "../ai/getOffersTool";
import { createEmptyOfferIntent } from "../ai/offerIntent";

describe("getOffersTool confirmation prompt", () => {
  it("always asks for confirmation and omits unmentioned optional preferences", () => {
    const result = resolveOfferSlots(
      createEmptyOfferIntent(),
      {
        check_in: "2026-02-20",
        check_out: "2026-02-22",
        adults: 2,
        rooms: 1,
      },
      new Date("2026-02-10T20:00:00Z"),
    );

    expect(result.status).toBe("NEEDS_CLARIFICATION");
    if (result.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    expect(result.clarificationPrompt).toContain("Is this correct?");
    expect(result.clarificationPrompt).not.toContain("pet-friendly");
    expect(result.clarificationPrompt).not.toContain("accessible room");
    expect(result.clarificationPrompt).not.toContain("two beds");
    expect(result.clarificationPrompt).not.toContain("parking needed");
  });

  it("includes optional preferences only when user provided them", () => {
    const result = resolveOfferSlots(createEmptyOfferIntent(), {
      check_in: "2026-02-20",
      check_out: "2026-02-22",
      adults: 2,
      rooms: 1,
      pet_friendly: true,
      parking_needed: false,
    });

    expect(result.status).toBe("NEEDS_CLARIFICATION");
    if (result.status !== "NEEDS_CLARIFICATION") {
      return;
    }

    expect(result.clarificationPrompt).toContain("pet-friendly yes");
    expect(result.clarificationPrompt).toContain("parking needed no");
    expect(result.clarificationPrompt).not.toContain("accessible room");
    expect(result.clarificationPrompt).not.toContain("two beds");
    expect(result.clarificationPrompt).toContain("Is this correct?");
  });
});
