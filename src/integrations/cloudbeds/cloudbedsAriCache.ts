import env from "../../config/env";
import type { CloudbedsAriRaw, CloudbedsAriRequest } from "./cloudbedsClient";
import { getAriRaw } from "./cloudbedsClient";
import { redisGet, redisSetEx } from "../redisClient";
import { logger } from "../../utils/logger";
import { createHash } from "node:crypto";

const CACHE_PREFIX = "cloudbeds:ari:v1";

const buildCacheKey = (request: CloudbedsAriRequest): string => {
  const payload = JSON.stringify({
    propertyId: request.propertyId,
    checkIn: request.checkIn,
    checkOut: request.checkOut ?? null,
    nights: request.nights ?? null,
    adults: request.adults,
    rooms: request.rooms,
    children: request.children ?? 0,
    pet_friendly: request.pet_friendly ?? null,
    accessible_room: request.accessible_room ?? null,
    needs_two_beds: request.needs_two_beds ?? null,
    parking_needed: request.parking_needed ?? null,
    budget_cap: request.budget_cap ?? null,
    stubScenario: request.stubScenario ?? null,
    currency: request.currency,
    timezone: request.timezone,
  });

  const fingerprint = createHash("sha256").update(payload).digest("hex");
  return `${CACHE_PREFIX}:${fingerprint}`;
};

const parseCached = (raw: string): CloudbedsAriRaw | null => {
  try {
    return JSON.parse(raw) as CloudbedsAriRaw;
  } catch {
    return null;
  }
};

const getCachedAriRaw = async (request: CloudbedsAriRequest): Promise<CloudbedsAriRaw | null> => {
  const key = buildCacheKey(request);
  const cached = await redisGet(key);
  if (!cached) {
    return null;
  }

  const parsed = parseCached(cached);
  if (!parsed) {
    logger.warn("Invalid ARI cache payload", { key });
    return null;
  }

  return parsed;
};

const storeAriRaw = async (request: CloudbedsAriRequest, raw: CloudbedsAriRaw): Promise<void> => {
  const key = buildCacheKey(request);
  const stored = await redisSetEx(key, env.ARI_CACHE_TTL_SECONDS, JSON.stringify(raw));
  if (!stored) {
    logger.warn("Failed to write ARI cache", { key });
  }
};

export const getCloudbedsAriRaw = async (request: CloudbedsAriRequest): Promise<CloudbedsAriRaw> => {
  if (env.NODE_ENV === "test") {
    return getAriRaw(request);
  }

  const cached = await getCachedAriRaw(request);
  if (cached) {
    return cached;
  }

  // Keep PMS retrieval as a stub for now; cache wraps around this source.
  const fresh = getAriRaw(request);
  await storeAriRaw(request, fresh);
  return fresh;
};
