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

export const getScoreWeights = ({
  tripType: _tripType,
  posture: _posture,
  strategy: _strategy,
}: {
  tripType: TripType;
  posture: DecisionPosture;
  strategy: StrategyMode;
}): ScoreWeights => {
  return defaultWeights;
};
