import type { DecisionPosture, StrategyMode, TripType } from "../types";

export type ScoreWeights = {
  value: number;
  conversion: number;
  experience: number;
  margin: number;
  risk: number;
};

const defaultWeights: ScoreWeights = {
  value: 0.3,
  conversion: 0.35,
  experience: 0.1,
  margin: 0.1,
  risk: 0.15,
};

const key = (tripType: TripType, posture: DecisionPosture, strategy: StrategyMode): string =>
  `${tripType}:${posture}:${strategy}`;

const table: Record<string, ScoreWeights> = {
  [key("family", "certainty", "balanced")]: { value: 0.25, conversion: 0.45, experience: 0.1, margin: 0.1, risk: 0.2 },
  [key("couple", "experience", "protect_rate")]: {
    value: 0.1,
    conversion: 0.3,
    experience: 0.35,
    margin: 0.25,
    risk: 0.15,
  },
  [key("business", "urgent", "balanced")]: { value: 0.25, conversion: 0.5, experience: 0.05, margin: 0.1, risk: 0.2 },
  [key("solo", "price", "fill_rooms")]: { value: 0.5, conversion: 0.25, experience: 0.05, margin: 0.05, risk: 0.15 },
};

export const getScoreWeights = ({
  tripType,
  posture,
  strategy,
}: {
  tripType: TripType;
  posture: DecisionPosture;
  strategy: StrategyMode;
}): ScoreWeights => {
  return table[key(tripType, posture, strategy)] ?? defaultWeights;
};
