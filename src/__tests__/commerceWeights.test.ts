import { describe, expect, it } from "vitest";
import { getScoreWeights } from "../services/commerce/scoring/weights";

describe("commerce scoring weights", () => {
  it("normalizes non-risk weights and keeps risk in bounds", () => {
    const tripTypes = ["family", "business", "couple", "solo", "group_lite"] as const;
    const postures = ["urgent", "certainty", "price", "experience"] as const;

    for (const tripType of tripTypes) {
      for (const posture of postures) {
        const weights = getScoreWeights({
          tripType,
          posture,
          strategy: "balanced",
        });
        const nonRiskSum = weights.value + weights.conversion + weights.experience + weights.margin;
        expect(nonRiskSum).toBeCloseTo(1, 3);
        expect(weights.risk).toBeGreaterThanOrEqual(0.05);
        expect(weights.risk).toBeLessThanOrEqual(0.35);
      }
    }
  });

  it("price posture keeps margin near zero and emphasizes value", () => {
    const weights = getScoreWeights({
      tripType: "couple",
      posture: "price",
      strategy: "balanced",
    });

    expect(weights.margin).toBe(0);
    expect(weights.value).toBeGreaterThan(weights.conversion);
    expect(weights.value).toBeGreaterThan(weights.experience);
  });

  it("urgent posture emphasizes conversion over value", () => {
    const weights = getScoreWeights({
      tripType: "business",
      posture: "urgent",
      strategy: "balanced",
    });

    expect(weights.conversion).toBeGreaterThan(weights.value);
  });
});
