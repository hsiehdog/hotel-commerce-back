import env from "../config/env";
import { logger } from "../utils/logger";

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

type RedisLikeClient = {
  connect: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  setEx: (key: string, ttlSeconds: number, value: string) => Promise<unknown>;
  isOpen?: boolean;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
};

let client: RedisLikeClient | null = null;
let connectPromise: Promise<RedisLikeClient | null> | null = null;

const resetClient = (candidate?: RedisLikeClient) => {
  if (!candidate || client === candidate) {
    client = null;
  }
  connectPromise = null;
};

const attachClientListeners = (nextClient: RedisLikeClient) => {
  if (!nextClient.on) {
    return;
  }

  nextClient.on("error", (error) => {
    logger.warn("Redis client error", { error });
  });

  nextClient.on("reconnecting", () => {
    logger.warn("Redis client reconnecting");
  });

  nextClient.on("end", () => {
    logger.warn("Redis client connection ended");
    resetClient(nextClient);
  });
};

const createClientInstance = async (): Promise<RedisLikeClient | null> => {
  try {
    const redisModuleName = "redis";
    const redisModule = (await import(redisModuleName)) as {
      createClient: (options: { url: string }) => RedisLikeClient;
    };
    const nextClient = redisModule.createClient({
      url: env.REDIS_URL ?? DEFAULT_REDIS_URL,
    });
    attachClientListeners(nextClient);
    await nextClient.connect();
    client = nextClient;
    return nextClient;
  } catch (error) {
    logger.warn("Redis client initialization failed", { error });
    resetClient();
    return null;
  }
};

const getClient = async (): Promise<RedisLikeClient | null> => {
  if (client?.isOpen) {
    return client;
  }

  if (!connectPromise) {
    connectPromise = createClientInstance().finally(() => {
      connectPromise = null;
    });
  }

  const resolved = await connectPromise;
  return resolved?.isOpen ? resolved : null;
};

export const redisGet = async (key: string): Promise<string | null> => {
  const activeClient = await getClient();
  if (!activeClient) {
    return null;
  }

  try {
    return await activeClient.get(key);
  } catch (error) {
    logger.warn("Redis GET failed", { key, error });
    resetClient(activeClient);
  }

  const retryClient = await getClient();
  if (!retryClient) {
    return null;
  }

  try {
    return await retryClient.get(key);
  } catch (error) {
    logger.warn("Redis GET retry failed", { key, error });
    resetClient(retryClient);
    return null;
  }
};

export const redisSetEx = async (key: string, ttlSeconds: number, value: string): Promise<boolean> => {
  const activeClient = await getClient();
  if (!activeClient) {
    return false;
  }

  try {
    await activeClient.setEx(key, ttlSeconds, value);
    return true;
  } catch (error) {
    logger.warn("Redis SETEX failed", { key, error });
    resetClient(activeClient);
  }

  const retryClient = await getClient();
  if (!retryClient) {
    return false;
  }

  try {
    await retryClient.setEx(key, ttlSeconds, value);
    return true;
  } catch (error) {
    logger.warn("Redis SETEX retry failed", { key, error });
    resetClient(retryClient);
    return false;
  }
};
