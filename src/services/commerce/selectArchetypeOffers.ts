import type { ChannelCapabilities, ChannelType, ScoredCandidate, StrategyMode } from "./types";
import { PRICE_DELTA_MAX_ABSOLUTE, PRICE_DELTA_MAX_PERCENT } from "./commercePolicyV1";

export type ArchetypeSelectionResult = {
  primary: ScoredCandidate | null;
  secondary: ScoredCandidate | null;
  secondarySavingsQualified: boolean;
  reasonCodes: string[];
  saverPrimaryExceptionApplied: boolean;
  saverPrimaryExceptionContext?: {
    lowInventory: boolean;
    roomsAvailable?: number;
    deltaPercent: number;
  };
  secondaryFailureReason: "SECONDARY_POOL_EMPTY_OPPOSITE_ARCHETYPE" | "SECONDARY_REJECTED_PRICE_SPREAD_GUARDRAIL" | null;
};

export const selectArchetypeOffers = ({
  scoredCandidates,
  strategyMode,
}: {
  scoredCandidates: ScoredCandidate[];
  strategyMode: StrategyMode;
}): ArchetypeSelectionResult => {
  const reasonCodes: string[] = [];
  const safe = scoredCandidates.filter((candidate) => candidate.archetype === "SAFE");
  const saver = scoredCandidates.filter((candidate) => candidate.archetype === "SAVER");

  const bestSafe = safe[0] ?? null;
  const bestSaver = saver[0] ?? null;

  let saverPrimaryExceptionApplied = false;
  let saverPrimaryExceptionContext: ArchetypeSelectionResult["saverPrimaryExceptionContext"] | undefined;
  let primary = bestSafe ?? scoredCandidates[0] ?? null;

  const saverPrimaryEval =
    bestSafe && bestSaver
      ? evaluateSaverPrimaryException(bestSafe, bestSaver)
      : { applies: false, lowInventory: false, roomsAvailable: undefined, deltaPercent: 0 };

  if (bestSafe && bestSaver && saverPrimaryEval.applies) {
    primary = bestSaver;
    saverPrimaryExceptionApplied = true;
    saverPrimaryExceptionContext = {
      lowInventory: saverPrimaryEval.lowInventory,
      roomsAvailable: saverPrimaryEval.roomsAvailable,
      deltaPercent: saverPrimaryEval.deltaPercent,
    };
    reasonCodes.push("SELECT_PRIMARY_SAVER_EXCEPTION_LOW_INVENTORY");
  }

  if (primary?.archetype === "SAFE") {
    reasonCodes.push("SELECT_PRIMARY_SAFE");
  } else if (primary?.archetype === "SAVER" && !saverPrimaryExceptionApplied) {
    reasonCodes.push("SELECT_PRIMARY_SAVER_ONLY_AVAILABLE");
  }

  if (!primary) {
    return {
      primary: null,
      secondary: null,
      secondarySavingsQualified: false,
      reasonCodes,
      saverPrimaryExceptionApplied,
      saverPrimaryExceptionContext,
      secondaryFailureReason: "SECONDARY_POOL_EMPTY_OPPOSITE_ARCHETYPE",
    };
  }

  const secondaryPool =
    primary.archetype === "SAFE"
      ? saver
      : primary.archetype === "SAVER"
        ? safe
        : scoredCandidates.filter((candidate) => candidate.ratePlanId !== primary.ratePlanId);

  let secondary = secondaryPool.find((candidate) => withinDeltaGuardrail(strategyMode, primary, candidate)) ?? null;
  let secondaryFailureReason: ArchetypeSelectionResult["secondaryFailureReason"] = null;
  const oppositePoolEmpty = secondaryPool.length === 0;
  if (!secondary && oppositePoolEmpty) {
    reasonCodes.push("SECONDARY_POOL_EMPTY_OPPOSITE_ARCHETYPE");
    const sameArchetypeFallbackPool = scoredCandidates.filter(
      (candidate) =>
        candidate !== primary &&
        candidate.archetype === primary.archetype &&
        (candidate.ratePlanId !== primary.ratePlanId || candidate.roomTypeId !== primary.roomTypeId),
    );
    secondary =
      sameArchetypeFallbackPool.find((candidate) => withinDeltaGuardrail(strategyMode, primary, candidate)) ?? null;
    if (secondary) {
      reasonCodes.push("SECONDARY_SAME_ARCHETYPE_FALLBACK");
    } else {
      secondaryFailureReason = "SECONDARY_POOL_EMPTY_OPPOSITE_ARCHETYPE";
      if (sameArchetypeFallbackPool.length > 0) {
        reasonCodes.push("SECONDARY_REJECTED_PRICE_SPREAD_GUARDRAIL");
        secondaryFailureReason = "SECONDARY_REJECTED_PRICE_SPREAD_GUARDRAIL";
      }
    }
  } else if (!secondary && secondaryPool.length > 0) {
    reasonCodes.push("SECONDARY_REJECTED_PRICE_SPREAD_GUARDRAIL");
    secondaryFailureReason = "SECONDARY_REJECTED_PRICE_SPREAD_GUARDRAIL";
    secondary = null;
  }

  const secondarySavingsQualified = isSecondarySavingsQualified(primary, secondary);
  if (secondary && secondary.archetype === "SAVER" && !secondarySavingsQualified) {
    reasonCodes.push("SECONDARY_SAVER_LOW_SAVINGS");
  }
  if (secondary?.archetype === "SAVER") {
    reasonCodes.push("SELECT_SECONDARY_SAVER");
  } else if (secondary?.archetype === "SAFE") {
    reasonCodes.push("SELECT_SECONDARY_SAFE");
  }

  return {
    primary,
    secondary,
    secondarySavingsQualified,
    reasonCodes,
    saverPrimaryExceptionApplied,
    saverPrimaryExceptionContext,
    secondaryFailureReason,
  };
};

export type FallbackActionCode =
  | "FALLBACK_ALTERNATE_DATES"
  | "FALLBACK_TEXT_LINK"
  | "FALLBACK_TRANSFER_FRONT_DESK"
  | "FALLBACK_WAITLIST"
  | "FALLBACK_CONTACT_PROPERTY";

export const selectFallbackAction = ({
  channel,
  capabilities,
  isOpenNow,
  offersCount,
}: {
  channel: ChannelType;
  capabilities: ChannelCapabilities;
  isOpenNow: boolean;
  offersCount: number;
}): FallbackActionCode | null => {
  if (offersCount >= 2) {
    return null;
  }

  if (offersCount === 1) {
    if (channel === "web") {
      return "FALLBACK_ALTERNATE_DATES";
    }
    if (channel === "voice" && capabilities.canTextLink && capabilities.hasWebBookingUrl) {
      return "FALLBACK_TEXT_LINK";
    }
    if (channel === "voice" && capabilities.canTransferToFrontDesk && isOpenNow) {
      return "FALLBACK_TRANSFER_FRONT_DESK";
    }
    return "FALLBACK_ALTERNATE_DATES";
  }

  if (channel === "web") {
    if (capabilities.hasWebBookingUrl) {
      return "FALLBACK_CONTACT_PROPERTY";
    }
    return "FALLBACK_ALTERNATE_DATES";
  }

  if (channel === "voice" && capabilities.canTransferToFrontDesk && isOpenNow) {
    return "FALLBACK_TRANSFER_FRONT_DESK";
  }
  if (capabilities.canTextLink && capabilities.hasWebBookingUrl) {
    return "FALLBACK_TEXT_LINK";
  }
  if (capabilities.canCollectWaitlist) {
    return "FALLBACK_WAITLIST";
  }
  return "FALLBACK_ALTERNATE_DATES";
};

const withinDeltaGuardrail = (strategyMode: StrategyMode, primary: ScoredCandidate, secondary: ScoredCandidate): boolean => {
  if (primary.currency !== secondary.currency || primary.price.basis !== secondary.price.basis) {
    return false;
  }
  const delta = Math.abs(primary.price.amount - secondary.price.amount);
  const minAmount = Math.max(0.01, Math.min(primary.price.amount, secondary.price.amount));
  const deltaPercent = (delta / minAmount) * 100;
  return (
    delta <= PRICE_DELTA_MAX_ABSOLUTE[strategyMode] &&
    deltaPercent <= PRICE_DELTA_MAX_PERCENT[strategyMode]
  );
};

const evaluateSaverPrimaryException = (
  bestSafe: ScoredCandidate,
  bestSaver: ScoredCandidate,
): { applies: boolean; lowInventory: boolean; roomsAvailable?: number; deltaPercent: number } => {
  if (bestSafe.currency !== bestSaver.currency || bestSafe.price.basis !== bestSaver.price.basis) {
    return { applies: false, lowInventory: false, roomsAvailable: undefined, deltaPercent: 0 };
  }
  const roomsAvailable = Math.min(bestSafe.roomsAvailable ?? 99, bestSaver.roomsAvailable ?? 99);
  const lowInventory = roomsAvailable <= 2;
  const delta = (bestSafe.price.amount - bestSaver.price.amount) / Math.max(0.01, bestSafe.price.amount);
  return {
    applies: lowInventory && delta >= 0.3,
    lowInventory,
    roomsAvailable: Number.isFinite(roomsAvailable) ? roomsAvailable : undefined,
    deltaPercent: delta * 100,
  };
};

const isSecondarySavingsQualified = (primary: ScoredCandidate, secondary: ScoredCandidate | null): boolean => {
  if (!secondary || secondary.archetype !== "SAVER") {
    return true;
  }
  if (primary.currency !== secondary.currency || primary.price.basis !== secondary.price.basis) {
    return false;
  }
  const savings = primary.price.amount - secondary.price.amount;
  const savingsPct = savings / Math.max(0.01, primary.price.amount);
  return savings >= 20 || savingsPct >= 0.03;
};
