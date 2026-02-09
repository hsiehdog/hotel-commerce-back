import type { OfferOption } from "../../ai/getOffersTool";
import type { FallbackAction } from "./commerceEvaluators";
import type { StrategyMode } from "./commercePolicyV1";

export type CommerceDecisionTrace = {
  policyVersion: string;
  strategyMode: StrategyMode;
  requestCurrency: string;
  rejectedCandidateReasons: string[];
  saverPrimaryExceptionApplied: boolean;
};

export type PresentationUrgency =
  | {
      type: "scarcity_rooms";
      value: number;
      source: string;
    }
  | null;

export type PresentationHints = {
  recommendedLabel?: string;
  contrastExplanation?: string;
  framingFocus?: "certainty" | "value" | "comfort" | "experience" | "efficiency";
  urgency: PresentationUrgency;
};

export type CommerceOfferResponse = {
  offers: OfferOption[];
  fallbackAction?: FallbackAction;
  decisionTrace: CommerceDecisionTrace;
  presentationHints: PresentationHints;
};
