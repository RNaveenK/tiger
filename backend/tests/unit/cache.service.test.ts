import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CacheService,
  InMemoryCacheStore,
  CACHE_CONSTANTS,
  CacheLogger,
} from '../../src/services/cache.service.js';
import { SearchRequest, SortDirection } from '../../src/types/index.js';

describe('CacheService', () => {
  let store: InMemoryCacheStore;
  let service: CacheService;
  let logger: CacheLogger;

  beforeEach(() => {
    store = new InMemoryCacheStore();
    logger = {
      warn: vi.fn(),
      error: vi.fn(),
    };
    service = new CacheService(store, logger);
  });

  describe('getCachedResult', () => {
    it('should return null on cache miss', async () => {
      const result = await service.getCachedResult('nonexistent-key');
      expect(result).toBeNull();
    });

    it('should return cached value on hit', async () => {
      const data = { records: [{ id: '1' }], pagination: { page: 1 } };
      await store.set('test-key', JSON.stringify(data), 60);

      const result = await service.getCachedResult('test-key');
      expect(result).toEqual(data);
    });

    it('should return null when cache store is unavailable', async () => {
      await store.set('test-key', JSON.stringify({ value: 'test' }), 60);
      store.setAvailable(false);

      const result = await service.getCachedResult('test-key');
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Cache store unavailable, returning cache miss',
        expect.objectContaining({ key: 'test-key' })
      );
    });

    it('should return null and log error on parse failure', async () => {
      await store.set('test-key', 'invalid-json{{{', 60);

      const result = await service.getCachedResult('test-key');
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Error reading from cache, returning cache miss',
        expect.objectContaining({ key: 'test-key' })
      );
    });

    it('should return null for expired entries', async () => {
      // Set with 0 TTL (immediately expired)
      await store.set('test-key', JSON.stringify({ value: 'test' }), 0);

      // Wait a tick to ensure expiry
      await new Promise((resolve) => setTimeout(resolve, 5));

      const result = await service.getCachedResult('test-key');
      expect(result).toBeNull();
    });
  });

  describe('setCachedResult', () => {
    it('should store value with default TTL', async () => {
      const data = { records: [], pagination: { page: 1, totalRecords: 0 } };
      await service.setCachedResult('test-key', data);

      const result = await store.get('test-key');
      expect(result).not.toBeNull();
      expect(JSON.parse(result!)).toEqual(data);
    });

    it('should store value with custom TTL', async () => {
      const data = { result: 'custom-ttl' };
      await service.setCachedResult('test-key', data, 120);

      const result = await store.get('test-key');
      expect(result).not.toBeNull();
      expect(JSON.parse(result!)).toEqual(data);
    });

    it('should use 60-second default TTL', async () => {
      const data = { value: 'test' };
      await service.setCachedResult('test-key', data);

      // Value should be available immediately
      const result = await store.get('test-key');
      expect(result).not.toBeNull();
    });

    it('should silently fail when store is unavailable', async () => {
      store.setAvailable(false);
      const data = { value: 'test' };

      // Should not throw
      await service.setCachedResult('test-key', data);

      expect(logger.warn).toHaveBeenCalledWith(
        'Cache store unavailable, skipping cache write',
        expect.objectContaining({ key: 'test-key' })
      );
    });

    it('should handle serialization of complex objects', async () => {
      const data = {
        records: [
          { id: '1', storeId: 'STORE-001', price: 29.99, tags: ['a', 'b'] },
        ],
        pagination: { page: 1, pageSize: 50, totalRecords: 1, truncated: false },
      };

      await service.setCachedResult('complex-key', data);
      const result = await service.getCachedResult('complex-key');
      expect(result).toEqual(data);
    });
  });

  describe('invalidateByPattern', () => {
    it('should invalidate matching keys', async () => {
      await store.set('pricing:search:abc123', '{"data": 1}', 60);
      await store.set('pricing:search:def456', '{"data": 2}', 60);
      await store.set('other:key', '{"data": 3}', 60);

      const count = await service.invalidateByPattern('pricing:search:*');

      expect(count).toBe(2);
      expect(await store.get('pricing:search:abc123')).toBeNull();
      expect(await store.get('pricing:search:def456')).toBeNull();
      expect(await store.get('other:key')).not.toBeNull();
    });

    it('should return 0 when no keys match', async () => {
      await store.set('pricing:search:abc123', '{"data": 1}', 60);

      const count = await service.invalidateByPattern('nonexistent:*');
      expect(count).toBe(0);
    });

    it('should return 0 when store is unavailable', async () => {
      await store.set('pricing:search:abc123', '{"data": 1}', 60);
      store.setAvailable(false);

      const count = await service.invalidateByPattern('pricing:search:*');
      expect(count).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        'Cache store unavailable, skipping invalidation',
        expect.objectContaining({ pattern: 'pricing:search:*' })
      );
    });
  });

  describe('invalidateAll', () => {
    it('should flush all entries with search prefix', async () => {
      await store.set('pricing:search:abc123', '{"data": 1}', 60);
      await store.set('pricing:search:def456', '{"data": 2}', 60);
      await store.set('other:key', '{"data": 3}', 60);

      await service.invalidateAll();

      expect(await store.get('pricing:search:abc123')).toBeNull();
      expect(await store.get('pricing:search:def456')).toBeNull();
      // Other prefixes should be unaffected
      expect(await store.get('other:key')).not.toBeNull();
    });

    it('should silently handle unavailable store', async () => {
      store.setAvailable(false);

      // Should not throw
      await service.invalidateAll();

      expect(logger.warn).toHaveBeenCalledWith(
        'Cache store unavailable, skipping full invalidation'
      );
    });
  });

  describe('generateCacheKey', () => {
    it('should produce deterministic key for same request', () => {
      const request: SearchRequest = {
        criteria: { storeId: 'STORE-001', sku: 'SKU-123' },
        pagination: { page: 1, pageSize: 50 },
        sort: { field: 'date', direction: SortDirection.Desc },
      };

      const key1 = service.generateCacheKey(request);
      const key2 = service.generateCacheKey(request);

      expect(key1).toBe(key2);
    });

    it('should produce same key regardless of criteria property order', () => {
      const request1: SearchRequest = {
        criteria: { storeId: 'STORE-001', sku: 'SKU-123' },
      };

      const request2: SearchRequest = {
        criteria: { sku: 'SKU-123', storeId: 'STORE-001' },
      };

      const key1 = service.generateCacheKey(request1);
      const key2 = service.generateCacheKey(request2);

      expect(key1).toBe(key2);
    });

    it('should include key prefix', () => {
      const request: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
      };

      const key = service.generateCacheKey(request);
      expect(key.startsWith(CACHE_CONSTANTS.KEY_PREFIX)).toBe(true);
    });

    it('should produce different keys for different criteria', () => {
      const request1: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
      };
      const request2: SearchRequest = {
        criteria: { storeId: 'STORE-002' },
      };

      const key1 = service.generateCacheKey(request1);
      const key2 = service.generateCacheKey(request2);

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different pagination', () => {
      const request1: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
        pagination: { page: 1, pageSize: 50 },
      };
      const request2: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
        pagination: { page: 2, pageSize: 50 },
      };

      const key1 = service.generateCacheKey(request1);
      const key2 = service.generateCacheKey(request2);

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different sort', () => {
      const request1: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
        sort: { field: 'price', direction: SortDirection.Asc },
      };
      const request2: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
        sort: { field: 'price', direction: SortDirection.Desc },
      };

      const key1 = service.generateCacheKey(request1);
      const key2 = service.generateCacheKey(request2);

      expect(key1).not.toBe(key2);
    });

    it('should normalize product name to lowercase for key generation', () => {
      const request1: SearchRequest = {
        criteria: { productName: 'Widget' },
      };
      const request2: SearchRequest = {
        criteria: { productName: 'widget' },
      };

      const key1 = service.generateCacheKey(request1);
      const key2 = service.generateCacheKey(request2);

      expect(key1).toBe(key2);
    });

    it('should trim whitespace in string criteria', () => {
      const request1: SearchRequest = {
        criteria: { storeId: '  STORE-001  ' },
      };
      const request2: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
      };

      const key1 = service.generateCacheKey(request1);
      const key2 = service.generateCacheKey(request2);

      expect(key1).toBe(key2);
    });

    it('should use default pagination when not specified', () => {
      const request1: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
      };
      const request2: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
        pagination: { page: 1, pageSize: 50 },
      };

      const key1 = service.generateCacheKey(request1);
      const key2 = service.generateCacheKey(request2);

      expect(key1).toBe(key2);
    });

    it('should use default sort when not specified', () => {
      const request1: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
      };
      const request2: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
        sort: { field: 'record_date', direction: SortDirection.Desc },
      };

      const key1 = service.generateCacheKey(request1);
      const key2 = service.generateCacheKey(request2);

      expect(key1).toBe(key2);
    });

    it('should ignore empty string criteria values', () => {
      const request1: SearchRequest = {
        criteria: { storeId: 'STORE-001', sku: '' },
      };
      const request2: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
      };

      const key1 = service.generateCacheKey(request1);
      const key2 = service.generateCacheKey(request2);

      expect(key1).toBe(key2);
    });
  });

  describe('generateStorePattern', () => {
    it('should generate pattern with search prefix', () => {
      const pattern = service.generateStorePattern('STORE-001');
      expect(pattern).toContain(CACHE_CONSTANTS.KEY_PREFIX);
    });
  });
});

describe('InMemoryCacheStore', () => {
  let store: InMemoryCacheStore;

  beforeEach(() => {
    store = new InMemoryCacheStore();
  });

  describe('get/set', () => {
    it('should store and retrieve values', async () => {
      await store.set('key1', 'value1', 60);
      const result = await store.get('key1');
      expect(result).toBe('value1');
    });

    it('should return null for non-existent keys', async () => {
      const result = await store.get('missing');
      expect(result).toBeNull();
    });

    it('should expire entries after TTL', async () => {
      await store.set('key1', 'value1', 0);
      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 5));
      const result = await store.get('key1');
      expect(result).toBeNull();
    });

    it('should overwrite existing values', async () => {
      await store.set('key1', 'value1', 60);
      await store.set('key1', 'value2', 60);
      const result = await store.get('key1');
      expect(result).toBe('value2');
    });
  });

  describe('del', () => {
    it('should delete specified keys', async () => {
      await store.set('key1', 'value1', 60);
      await store.set('key2', 'value2', 60);
      await store.set('key3', 'value3', 60);

      await store.del(['key1', 'key3']);

      expect(await store.get('key1')).toBeNull();
      expect(await store.get('key2')).toBe('value2');
      expect(await store.get('key3')).toBeNull();
    });

    it('should handle deleting non-existent keys gracefully', async () => {
      await store.del(['nonexistent']);
      // Should not throw
    });
  });

  describe('keys', () => {
    it('should return keys matching a glob pattern', async () => {
      await store.set('pricing:search:abc', 'v1', 60);
      await store.set('pricing:search:def', 'v2', 60);
      await store.set('other:key', 'v3', 60);

      const result = await store.keys('pricing:search:*');
      expect(result).toHaveLength(2);
      expect(result).toContain('pricing:search:abc');
      expect(result).toContain('pricing:search:def');
    });

    it('should exclude expired keys from results', async () => {
      await store.set('pricing:search:expired', 'v1', 0);
      await store.set('pricing:search:valid', 'v2', 60);

      await new Promise((resolve) => setTimeout(resolve, 5));

      const result = await store.keys('pricing:search:*');
      expect(result).toHaveLength(1);
      expect(result).toContain('pricing:search:valid');
    });

    it('should return empty array when no keys match', async () => {
      await store.set('other:key', 'v1', 60);
      const result = await store.keys('pricing:search:*');
      expect(result).toHaveLength(0);
    });
  });

  describe('flushByPrefix', () => {
    it('should remove all keys with given prefix', async () => {
      await store.set('pricing:search:abc', 'v1', 60);
      await store.set('pricing:search:def', 'v2', 60);
      await store.set('other:key', 'v3', 60);

      await store.flushByPrefix('pricing:search:');

      expect(await store.get('pricing:search:abc')).toBeNull();
      expect(await store.get('pricing:search:def')).toBeNull();
      expect(await store.get('other:key')).toBe('v3');
    });
  });

  describe('isAvailable', () => {
    it('should return true by default', () => {
      expect(store.isAvailable()).toBe(true);
    });

    it('should return false when set to unavailable', () => {
      store.setAvailable(false);
      expect(store.isAvailable()).toBe(false);
    });
  });

  describe('size', () => {
    it('should return number of non-expired entries', async () => {
      await store.set('key1', 'v1', 60);
      await store.set('key2', 'v2', 60);
      expect(store.size()).toBe(2);
    });

    it('should exclude expired entries from count', async () => {
      await store.set('key1', 'v1', 60);
      await store.set('key2', 'v2', 0);

      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(store.size()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      await store.set('key1', 'v1', 60);
      await store.set('key2', 'v2', 60);

      store.clear();
      expect(store.size()).toBe(0);
      expect(await store.get('key1')).toBeNull();
    });
  });
});
