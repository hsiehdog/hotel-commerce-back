import { prisma } from "../../lib/prisma";
import type { ChannelCapabilities } from "./types";
import { isPropertyOpenAt } from "./commerceEvaluators";

export type ChannelCapabilityResolution = {
  capabilities: ChannelCapabilities;
  isOpenNow: boolean;
};

export const getChannelCapabilities = async (
  propertyId: string,
  config?: {
    enableTextLink: boolean;
    enableTransferFrontDesk: boolean;
    enableWaitlist: boolean;
    webBookingUrl?: string | null;
  },
): Promise<ChannelCapabilityResolution> => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        hours: true,
      },
    });

    const hasHoursConfig = Boolean(property?.timezone) && (property?.hours.length ?? 0) > 0;
    const isOpenNow = hasHoursConfig
      ? isPropertyOpenAt({
          nowUtc: new Date(),
          timezone: property?.timezone ?? "UTC",
          intervals: (property?.hours ?? []).map((hour) => ({
            dayOfWeek: hour.dayOfWeek,
            openTime: hour.openTime,
            closeTime: hour.closeTime,
          })),
        })
      : false;

    const hasWebBookingUrl = Boolean(config?.webBookingUrl && config.webBookingUrl.trim().length > 0);

    return {
      capabilities: {
        canTextLink: (config?.enableTextLink ?? true) && hasWebBookingUrl,
        canTransferToFrontDesk: (config?.enableTransferFrontDesk ?? true) && hasHoursConfig,
        canCollectWaitlist: config?.enableWaitlist ?? true,
        hasWebBookingUrl,
      },
      isOpenNow,
    };
  } catch {
    const hasWebBookingUrl = Boolean(config?.webBookingUrl && config.webBookingUrl.trim().length > 0);
    return {
      capabilities: {
        canTextLink: (config?.enableTextLink ?? true) && hasWebBookingUrl,
        canTransferToFrontDesk: false,
        canCollectWaitlist: config?.enableWaitlist ?? true,
        hasWebBookingUrl,
      },
      isOpenNow: false,
    };
  }
};
