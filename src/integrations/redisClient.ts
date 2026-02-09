import env from "../config/env";
import { logger } from "../utils/logger";

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

type RedisLikeClient = {
  connect: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  setEx: (key: string, ttlSeconds: number, value: string) => Promise<unknown>;
  isOpen?: boolean;
};

let clientPromise: Promise<RedisLikeClient | null> | null = null;

const createClientInstance = async (): Promise<RedisLikeClient | null> => {
  try {
    const redisModuleName = "redis";
    const redisModule = (await import(redisModuleName)) as {
      createClient: (options: { url: string }) => RedisLikeClient;
    };
    const client = redisModule.createClient({
      url: env.REDIS_URL ?? DEFAULT_REDIS_URL,
    });
    await client.connect();
    return client;
  } catch (error) {
    logger.warn("Redis client initialization failed", { error });
    return null;
  }
};

const getClient = async (): Promise<RedisLikeClient | null> => {
  if (!clientPromise) {
    clientPromise = createClientInstance();
  }
  return clientPromise;
};

export const redisGet = async (key: string): Promise<string | null> => {
  const client = await getClient();
  if (!client) {
    return null;
  }

  try {
    return await client.get(key);
  } catch (error) {
    logger.warn("Redis GET failed", { key, error });
    return null;
  }
};

export const redisSetEx = async (key: string, ttlSeconds: number, value: string): Promise<boolean> => {
  const client = await getClient();
  if (!client) {
    return false;
  }

  try {
    await client.setEx(key, ttlSeconds, value);
    return true;
  } catch (error) {
    logger.warn("Redis SETEX failed", { key, error });
    return false;
  }
};
