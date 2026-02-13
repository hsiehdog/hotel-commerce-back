import type { DecisionPosture, StrategyMode, TripType } from "../types";

export type ScoreWeights = {
  value: number;
  conversion: number;
  experience: number;
  margin: number;
  risk: number;
};

const BASE_WEIGHTS_BY_POSTURE: Record<DecisionPosture, ScoreWeights> = {
  urgent: { value: 0.2, conversion: 0.5, experience: 0.05, margin: 0.05, risk: 0.2 },
  certainty: { value: 0.2, conversion: 0.45, experience: 0.1, margin: 0.05, risk: 0.25 },
  price: { value: 0.6, conversion: 0.2, experience: 0.05, margin: 0, risk: 0.15 },
  experience: { value: 0.2, conversion: 0.2, experience: 0.45, margin: 0.1, risk: 0.15 },
};

const DELTA_BY_TRIP_TYPE: Record<TripType, ScoreWeights> = {
  family: { value: -0.05, conversion: 0.05, experience: 0.05, margin: -0.02, risk: 0.03 },
  business: { value: -0.03, conversion: 0.08, experience: -0.03, margin: 0, risk: 0.03 },
  couple: { value: -0.05, conversion: 0, experience: 0.1, margin: -0.02, risk: 0 },
  solo: { value: 0.08, conversion: -0.03, experience: -0.03, margin: -0.02, risk: -0.02 },
  group_lite: { value: 0.05, conversion: -0.02, experience: 0, margin: 0.05, risk: 0.02 },
};

const NON_RISK_KEYS: Array<keyof Omit<ScoreWeights, "risk">> = ["value", "conversion", "experience", "margin"];

export const getScoreWeights = ({
  tripType,
  posture,
  strategy: _strategy,
}: {
  tripType: TripType;
  posture: DecisionPosture;
  strategy: StrategyMode;
}): ScoreWeights => {
  const base = BASE_WEIGHTS_BY_POSTURE[posture];
  const delta = DELTA_BY_TRIP_TYPE[tripType];

  const rawNonRisk = NON_RISK_KEYS.reduce(
    (acc, key) => {
      acc[key] = clamp(base[key] + delta[key], 0, 0.7);
      return acc;
    },
    { value: 0, conversion: 0, experience: 0, margin: 0 },
  );

  const nonRiskSum = NON_RISK_KEYS.reduce((sum, key) => sum + rawNonRisk[key], 0);
  const normalizedNonRisk =
    nonRiskSum > 0
      ? NON_RISK_KEYS.reduce(
          (acc, key) => {
            acc[key] = round4(rawNonRisk[key] / nonRiskSum);
            return acc;
          },
          { value: 0, conversion: 0, experience: 0, margin: 0 },
        )
      : { value: 0.25, conversion: 0.25, experience: 0.25, margin: 0.25 };

  const risk = round4(clamp(base.risk + delta.risk, 0.05, 0.35));

  return {
    value: normalizedNonRisk.value,
    conversion: normalizedNonRisk.conversion,
    experience: normalizedNonRisk.experience,
    margin: normalizedNonRisk.margin,
    risk,
  };
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round4 = (value: number): number => Math.round(value * 10000) / 10000;
