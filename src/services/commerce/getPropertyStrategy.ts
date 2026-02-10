import { prisma } from "../../lib/prisma";
import type { StrategyMode } from "./types";

export type PropertyStrategy = {
  strategyMode: StrategyMode;
  upsellPosture?: string | null;
  cancellationSensitivity?: string | null;
  defaultCurrency?: string | null;
  urgencyEnabled: boolean;
  allowedUrgencyTypes: string[];
  enableTextLink: boolean;
  enableTransferFrontDesk: boolean;
  enableWaitlist: boolean;
  webBookingUrl?: string | null;
  configVersion: number;
};

const isStrategyMode = (value: string): value is StrategyMode =>
  value === "balanced" || value === "protect_rate" || value === "fill_rooms";

export const getPropertyStrategy = async (propertyId: string): Promise<PropertyStrategy> => {
  try {
    const [config, property] = await Promise.all([
      prisma.propertyCommerceConfig.findUnique({
        where: { propertyId },
      }),
      prisma.property.findUnique({
        where: { id: propertyId },
        select: { defaultCurrency: true },
      }),
    ]);

    if (!config) {
      return {
        strategyMode: "balanced",
        urgencyEnabled: true,
        allowedUrgencyTypes: ["scarcity_rooms"],
        enableTextLink: true,
        enableTransferFrontDesk: true,
        enableWaitlist: true,
        webBookingUrl: "https://example.com/book",
        defaultCurrency: property?.defaultCurrency ?? "USD",
        configVersion: 1,
      };
    }

    return {
      strategyMode: isStrategyMode(config.strategyMode) ? config.strategyMode : "balanced",
      upsellPosture: config.upsellPosture,
      cancellationSensitivity: config.cancellationSensitivity,
      defaultCurrency: config.defaultCurrency ?? property?.defaultCurrency ?? null,
      urgencyEnabled: config.urgencyEnabled,
      allowedUrgencyTypes: parseAllowedUrgencyTypes(config.allowedUrgencyTypes),
      enableTextLink: config.enableTextLink,
      enableTransferFrontDesk: config.enableTransferFrontDesk,
      enableWaitlist: config.enableWaitlist,
      webBookingUrl: config.webBookingUrl,
      configVersion: config.version,
    };
  } catch {
    return {
      strategyMode: "balanced",
      urgencyEnabled: true,
      allowedUrgencyTypes: ["scarcity_rooms"],
      enableTextLink: true,
      enableTransferFrontDesk: true,
      enableWaitlist: true,
      webBookingUrl: "https://example.com/book",
      configVersion: 1,
    };
  }
};

const parseAllowedUrgencyTypes = (raw: string | null): string[] => {
  if (!raw) {
    return ["scarcity_rooms"];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const values = parsed.filter((value): value is string => typeof value === "string");
      return values.length > 0 ? values : ["scarcity_rooms"];
    }
  } catch {
    // fall through
  }
  return ["scarcity_rooms"];
};
