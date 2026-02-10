import type { Candidate, ScoredCandidate } from "../types";
import { getScoreWeights } from "./weights";

export const scoreCandidates = ({
  candidates,
  tripType,
  posture,
  strategyMode,
}: {
  candidates: Candidate[];
  tripType: "family" | "business" | "couple" | "solo" | "group_lite";
  posture: "certainty" | "price" | "experience" | "urgent";
  strategyMode: "balanced" | "protect_rate" | "fill_rooms";
}): ScoredCandidate[] => {
  if (candidates.length === 0) {
    return [];
  }

  const weights = getScoreWeights({
    tripType,
    posture,
    strategy: strategyMode,
  });

  const prices = candidates.map((candidate) => candidate.price.amount);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);

  const scored = candidates.map((candidate) => {
    const valueScore = pMax === pMin ? 50 : (100 * (pMax - candidate.price.amount)) / (pMax - pMin);
    const marginProxyScore = pMax === pMin ? 50 : (100 * (candidate.price.amount - pMin)) / (pMax - pMin);

    const conversionScore = clamp(
      50 +
        (candidate.refundability === "refundable" ? 25 : 0) +
        (candidate.paymentTiming === "pay_at_property" ? 10 : 0) +
        (candidate.paymentTiming === "pay_now" ? -5 : 0) +
        (candidate.refundability === "non_refundable" ? -20 : 0),
      0,
      100,
    );

    const riskScore = clamp(
      (candidate.refundability === "non_refundable" ? 35 : 0) +
        (candidate.paymentTiming === "pay_now" ? 10 : 0) +
        ((candidate.roomsAvailable ?? 99) <= 2 ? 15 : 0),
      0,
      100,
    );

    const experienceScore =
      candidate.roomTier === "suite" ? 80 : candidate.roomTier === "deluxe" ? 50 : 20;

    const total =
      weights.value * valueScore +
      weights.conversion * conversionScore +
      weights.experience * experienceScore +
      weights.margin * marginProxyScore -
      weights.risk * riskScore;

    const scoreTotal = clamp(total, -10000, 10000);

    return {
      ...candidate,
      scoreTotal,
      componentScores: {
        valueScore,
        conversionScore,
        experienceScore,
        riskScore,
        marginProxyScore,
      },
      archetype: classifyArchetype(candidate),
    } as ScoredCandidate;
  });

  return scored.sort((left, right) => {
    if (right.scoreTotal !== left.scoreTotal) {
      return right.scoreTotal - left.scoreTotal;
    }
    if (right.componentScores.conversionScore !== left.componentScores.conversionScore) {
      return right.componentScores.conversionScore - left.componentScores.conversionScore;
    }
    if (left.price.amount !== right.price.amount) {
      return left.price.amount - right.price.amount;
    }
    if (left.refundability !== right.refundability) {
      return left.refundability === "refundable" ? -1 : 1;
    }
    const leftKey = `${left.roomTypeId}:${left.ratePlanId}`;
    const rightKey = `${right.roomTypeId}:${right.ratePlanId}`;
    return leftKey.localeCompare(rightKey);
  });
};

const classifyArchetype = (candidate: Candidate): ScoredCandidate["archetype"] => {
  if (candidate.refundability === "refundable") {
    return "SAFE";
  }
  if (candidate.refundability === "non_refundable") {
    return "SAVER";
  }
  if (candidate.paymentTiming === "pay_at_property") {
    return "SAFE";
  }
  if (candidate.paymentTiming === "pay_now") {
    return "SAVER";
  }
  return "OTHER";
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
