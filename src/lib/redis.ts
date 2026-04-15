/**
 * Cache layer with Redis support and in-memory fallback.
 * If REDIS_URL is not set, uses a simple Map-based cache.
 */

interface CacheEntry {
  value: string;
  expiresAt: number;
}

// In-memory fallback cache
const memoryCache = new Map<string, CacheEntry>();

let redisClient: any = null;

async function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    const Redis = (await import("ioredis")).default;
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    await redisClient.connect();
    return redisClient;
  } catch {
    console.warn("Redis connection failed, using in-memory cache");
    return null;
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  const redis = await getRedis();

  if (redis) {
    try {
      return await redis.get(key);
    } catch {
      // fall through to memory cache
    }
  }

  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  const redis = await getRedis();

  if (redis) {
    try {
      await redis.setex(key, ttlSeconds, value);
      return;
    } catch {
      // fall through to memory cache
    }
  }

  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function cacheDel(key: string): Promise<void> {
  const redis = await getRedis();

  if (redis) {
    try {
      await redis.del(key);
    } catch {
      // ignore
    }
  }

  memoryCache.delete(key);
}

/**
 * Wrapper: fetch from cache or compute and store.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const hit = await cacheGet(key);
  if (hit) {
    return JSON.parse(hit) as T;
  }

  const result = await compute();
  await cacheSet(key, JSON.stringify(result), ttlSeconds);
  return result;
}
