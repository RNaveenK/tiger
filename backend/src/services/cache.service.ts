import { createHash } from 'crypto';
import Redis from 'ioredis';
import { SearchRequest, SearchResponse } from '../types/index.js';

// ─── Configuration ───────────────────────────────────────────────────────────

export const CACHE_CONSTANTS = {
  DEFAULT_TTL_SECONDS: 60,
  KEY_PREFIX: 'pricing:search:',
} as const;

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
}

// ─── Cache Store Interface ───────────────────────────────────────────────────

/**
 * Abstract cache store interface. Allows swapping between in-memory (testing)
 * and Redis (production) implementations.
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  flushByPrefix(prefix: string): Promise<void>;
  isAvailable(): boolean;
}

// ─── In-Memory Cache Store ───────────────────────────────────────────────────

interface CacheEntry {
  value: string;
  expiresAt: number;
}

/**
 * In-memory cache store for testing and local development.
 * Implements the same interface as Redis-backed store.
 */
export class InMemoryCacheStore implements CacheStore {
  private store: Map<string, CacheEntry> = new Map();
  private available: boolean = true;

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key);
    }
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = this.patternToRegex(pattern);
    const matchedKeys: string[] = [];

    for (const key of this.store.keys()) {
      // Also check expiry while iterating
      const entry = this.store.get(key)!;
      if (Date.now() > entry.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (regex.test(key)) {
        matchedKeys.push(key);
      }
    }

    return matchedKeys;
  }

  async flushByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  // Test helpers
  setAvailable(available: boolean): void {
    this.available = available;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    // Clean expired entries first
    for (const [key, entry] of this.store.entries()) {
      if (Date.now() > entry.expiresAt) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }

  private patternToRegex(pattern: string): RegExp {
    // Convert Redis-style glob pattern to regex
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }
}

// ─── Redis Cache Store ───────────────────────────────────────────────────────

/**
 * Redis-backed cache store using ioredis.
 * Gracefully handles Redis unavailability by returning null/empty results
 * and logging warnings instead of throwing.
 */
export class RedisCacheStore implements CacheStore {
  private client: Redis;
  private available: boolean = true;
  private logger: CacheLogger;

  constructor(config?: RedisConfig, logger?: CacheLogger) {
    this.logger = logger || {
      warn: (msg, ctx) => console.warn(`[RedisCacheStore] ${msg}`, ctx),
      error: (msg, ctx) => console.error(`[RedisCacheStore] ${msg}`, ctx),
    };

    this.client = new Redis({
      host: config?.host || process.env.REDIS_HOST || '127.0.0.1',
      port: config?.port || Number(process.env.REDIS_PORT) || 6379,
      password: config?.password || process.env.REDIS_PASSWORD || undefined,
      db: config?.db || 0,
      maxRetriesPerRequest: config?.maxRetriesPerRequest ?? 1,
      lazyConnect: config?.lazyConnect ?? true,
      retryStrategy: (times: number) => {
        if (times > 3) {
          this.available = false;
          return null; // Stop retrying
        }
        return Math.min(times * 200, 1000);
      },
    });

    this.client.on('connect', () => {
      this.available = true;
    });

    this.client.on('ready', () => {
      this.available = true;
    });

    this.client.on('error', (err) => {
      this.available = false;
      this.logger.warn('Redis connection error', { error: err.message });
    });

    this.client.on('close', () => {
      this.available = false;
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.warn('Redis GET failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn('Redis SET failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async del(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch (error) {
      this.logger.warn('Redis DEL failed', {
        keys,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      // Use SCAN for production-safe key iteration (non-blocking)
      const matchedKeys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = nextCursor;
        matchedKeys.push(...keys);
      } while (cursor !== '0');
      return matchedKeys;
    } catch (error) {
      this.logger.warn('Redis SCAN failed', {
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async flushByPrefix(prefix: string): Promise<void> {
    try {
      const keys = await this.keys(`${prefix}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      this.logger.warn('Redis flush by prefix failed', {
        prefix,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Connect to Redis. Call this during application startup.
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.available = true;
    } catch (error) {
      this.available = false;
      this.logger.warn('Redis connect failed, cache will be unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Disconnect from Redis. Call this during graceful shutdown.
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      // Ignore disconnect errors
    }
    this.available = false;
  }

  /** Expose underlying Redis client for health checks */
  getClient(): Redis {
    return this.client;
  }
}

// ─── Cache Service ───────────────────────────────────────────────────────────

export interface CacheLogger {
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const defaultLogger: CacheLogger = {
  warn: (message, context) => console.warn(`[CacheService] ${message}`, context),
  error: (message, context) => console.error(`[CacheService] ${message}`, context),
};

export class CacheService {
  private store: CacheStore;
  private logger: CacheLogger;

  constructor(store: CacheStore, logger?: CacheLogger) {
    this.store = store;
    this.logger = logger || defaultLogger;
  }

  /**
   * Get a cached result by key.
   * Returns null (cache miss) if key not found, expired, or Redis unavailable.
   */
  async getCachedResult<T>(key: string): Promise<T | null> {
    if (!this.store.isAvailable()) {
      this.logger.warn('Cache store unavailable, returning cache miss', { key });
      return null;
    }

    try {
      const raw = await this.store.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.error('Error reading from cache, returning cache miss', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Store a result in cache with the specified TTL.
   * Silently fails if Redis is unavailable (logs error).
   */
  async setCachedResult<T>(
    key: string,
    value: T,
    ttlSeconds: number = CACHE_CONSTANTS.DEFAULT_TTL_SECONDS
  ): Promise<void> {
    if (!this.store.isAvailable()) {
      this.logger.warn('Cache store unavailable, skipping cache write', { key });
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.store.set(key, serialized, ttlSeconds);
    } catch (error) {
      this.logger.error('Error writing to cache', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Invalidate all cache entries matching a pattern.
   * Uses Redis-style glob patterns (e.g., "*store_id:STORE-001*").
   * Silently fails if Redis is unavailable.
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    if (!this.store.isAvailable()) {
      this.logger.warn('Cache store unavailable, skipping invalidation', { pattern });
      return 0;
    }

    try {
      const matchingKeys = await this.store.keys(pattern);
      if (matchingKeys.length > 0) {
        await this.store.del(matchingKeys);
      }
      return matchingKeys.length;
    } catch (error) {
      this.logger.error('Error invalidating cache by pattern', {
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Invalidate all search cache entries.
   * Used after bulk operations like CSV uploads.
   */
  async invalidateAll(): Promise<void> {
    if (!this.store.isAvailable()) {
      this.logger.warn('Cache store unavailable, skipping full invalidation');
      return;
    }

    try {
      await this.store.flushByPrefix(CACHE_CONSTANTS.KEY_PREFIX);
    } catch (error) {
      this.logger.error('Error flushing cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate a deterministic cache key from a SearchRequest.
   * Normalizes the request parameters (sorts keys, trims strings) and
   * produces a SHA-256 hash to ensure consistent key generation.
   */
  generateCacheKey(request: SearchRequest): string {
    const normalized = this.normalizeSearchRequest(request);
    const hash = createHash('sha256').update(normalized).digest('hex');
    return `${CACHE_CONSTANTS.KEY_PREFIX}${hash}`;
  }

  /**
   * Generate a pattern for invalidating cache entries related to a specific
   * store_id. Used when records for a store are edited or uploaded.
   */
  generateStorePattern(storeId: string): string {
    return `${CACHE_CONSTANTS.KEY_PREFIX}*`;
  }

  // ─── Convenience Methods for Search Caching ────────────────────────────────

  /**
   * Get cached search results by key.
   * Returns null on cache miss or Redis unavailability.
   */
  async getCachedSearch(key: string): Promise<SearchResponse | null> {
    return this.getCachedResult<SearchResponse>(key);
  }

  /**
   * Cache search results with specified TTL.
   * Defaults to 60-second TTL. Silently fails on Redis unavailability.
   */
  async setCachedSearch(
    key: string,
    data: SearchResponse,
    ttl: number = CACHE_CONSTANTS.DEFAULT_TTL_SECONDS
  ): Promise<void> {
    return this.setCachedResult(key, data, ttl);
  }

  /**
   * Invalidate all search cache entries.
   * Called on record edit or CSV upload to ensure stale data is not served.
   */
  async invalidateSearchCache(): Promise<void> {
    return this.invalidateAll();
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Normalize a SearchRequest into a deterministic JSON string.
   * - Sorts object keys alphabetically
   * - Trims string values
   * - Removes undefined/null values
   * - Ensures consistent serialization regardless of property insertion order
   */
  private normalizeSearchRequest(request: SearchRequest): string {
    const normalized: Record<string, unknown> = {};

    // Normalize criteria
    const criteria: Record<string, unknown> = {};
    if (request.criteria) {
      const c = request.criteria;
      if (c.storeId !== undefined && c.storeId !== '') {
        criteria.storeId = c.storeId.trim();
      }
      if (c.sku !== undefined && c.sku !== '') {
        criteria.sku = c.sku.trim();
      }
      if (c.productName !== undefined && c.productName !== '') {
        criteria.productName = c.productName.trim().toLowerCase();
      }
      if (c.priceMin !== undefined) {
        criteria.priceMin = c.priceMin;
      }
      if (c.priceMax !== undefined) {
        criteria.priceMax = c.priceMax;
      }
      if (c.dateStart !== undefined && c.dateStart !== '') {
        criteria.dateStart = c.dateStart.trim();
      }
      if (c.dateEnd !== undefined && c.dateEnd !== '') {
        criteria.dateEnd = c.dateEnd.trim();
      }
    }
    normalized.criteria = criteria;

    // Normalize pagination (use defaults if not specified)
    normalized.pagination = {
      page: request.pagination?.page ?? 1,
      pageSize: request.pagination?.pageSize ?? 50,
    };

    // Normalize sort (use defaults if not specified)
    normalized.sort = {
      field: request.sort?.field ?? 'record_date',
      direction: request.sort?.direction ?? 'desc',
    };

    // Sort keys at all levels for deterministic output
    return JSON.stringify(normalized, Object.keys(normalized).sort());
  }
}

// ─── Factory Functions ─────────────────────────────────────────────────────────

/**
 * Create a CacheService backed by Redis.
 * Falls back gracefully if Redis is unavailable.
 */
export function createRedisCacheService(
  config?: RedisConfig,
  logger?: CacheLogger
): { cacheService: CacheService; store: RedisCacheStore } {
  const store = new RedisCacheStore(config, logger);
  const cacheService = new CacheService(store, logger);
  return { cacheService, store };
}

/**
 * Create a CacheService backed by in-memory store (for testing/development).
 */
export function createInMemoryCacheService(
  logger?: CacheLogger
): { cacheService: CacheService; store: InMemoryCacheStore } {
  const store = new InMemoryCacheStore();
  const cacheService = new CacheService(store, logger);
  return { cacheService, store };
}
