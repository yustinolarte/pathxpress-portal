/**
 * Simple in-memory TTL cache
 * No external dependencies — stores results in RAM with automatic expiry.
 * Max 100 entries to prevent unbounded memory growth.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, CacheEntry<any>>();
const MAX_ENTRIES = 100;

export function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlSeconds: number): void {
  if (cache.size >= MAX_ENTRIES) {
    // Evict the oldest entry
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function cacheInvalidate(key: string): void {
  cache.delete(key);
}

export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * Run fn, return cached result if still fresh, otherwise re-run and cache.
 */
export async function cachedQuery<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== null) return cached;
  const result = await fn();
  cacheSet(key, result, ttlSeconds);
  return result;
}
