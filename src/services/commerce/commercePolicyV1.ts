export const COMMERCE_POLICY_VERSION = "v1.0.0";

export const OCCUPANCY_THRESHOLD = 0.92;
export const LOW_INVENTORY_THRESHOLD = 2;
export const SAVER_PRIMARY_PRICE_DELTA_THRESHOLD = 0.3;

export const ATTRIBUTION_TIME_WINDOW_HOURS = 24;
export const DATE_SHIFT_TOLERANCE_DAYS = 1;

export const PRICE_DELTA_MAX_PERCENT = {
  protect_rate: 20,
  balanced: 25,
  fill_rooms: 35,
} as const;

export const PRICE_DELTA_MAX_ABSOLUTE = {
  protect_rate: 250,
  balanced: 300,
  fill_rooms: 400,
} as const;

export type StrategyMode = keyof typeof PRICE_DELTA_MAX_PERCENT;

export const STRATEGY_SCORING_WEIGHTS = {
  protect_rate: {
    conversionScore: "medium",
    marginScore: "high",
    policyRiskScore: "high",
    upsellPotentialScore: "medium",
  },
  balanced: {
    conversionScore: "high",
    marginScore: "high",
    policyRiskScore: "medium",
    upsellPotentialScore: "medium",
  },
  fill_rooms: {
    conversionScore: "high",
    marginScore: "medium",
    policyRiskScore: "low",
    upsellPotentialScore: "low",
  },
} as const;
