import { describe, it, expect, beforeEach } from 'vitest';
import {
  SearchService,
  SEARCH_CONSTANTS,
} from '../../src/services/search.service.js';
import { SearchRequest, SortDirection } from '../../src/types/index.js';

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    service = new SearchService();
  });

  describe('validateRequest', () => {
    it('should reject request with no criteria', () => {
      const request: SearchRequest = {
        criteria: {},
      };

      const error = service.validateRequest(request);
      expect(error).not.toBeNull();
      expect(error!.code).toBe('SEARCH_NO_CRITERIA');
      expect(error!.message).toContain('At least one search field is required');
    });

    it('should reject request with empty string criteria only', () => {
      const request: SearchRequest = {
        criteria: { storeId: '', sku: '', productName: '' },
      };

      const error = service.validateRequest(request);
      expect(error).not.toBeNull();
      expect(error!.code).toBe('SEARCH_NO_CRITERIA');
    });

    it('should reject Product Name shorter than 2 characters', () => {
      const request: SearchRequest = {
        criteria: { productName: 'A' },
      };

      const error = service.validateRequest(request);
      expect(error).not.toBeNull();
      expect(error!.code).toBe('SEARCH_PRODUCT_NAME_TOO_SHORT');
      expect(error!.details[0].field).toBe('productName');
    });

    it('should accept Product Name with exactly 2 characters', () => {
      const request: SearchRequest = {
        criteria: { productName: 'AB' },
      };

      const error = service.validateRequest(request);
      expect(error).toBeNull();
    });

    it('should reject pageSize greater than 200', () => {
      const request: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
        pagination: { page: 1, pageSize: 201 },
      };

      const error = service.validateRequest(request);
      expect(error).not.toBeNull();
      expect(error!.code).toBe('SEARCH_PAGE_SIZE_EXCEEDED');
      expect(error!.details[0].field).toBe('pageSize');
    });

    it('should accept pageSize of exactly 200', () => {
      const request: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
        pagination: { page: 1, pageSize: 200 },
      };

      const error = service.validateRequest(request);
      expect(error).toBeNull();
    });

    it('should accept valid request with single criterion', () => {
      const request: SearchRequest = {
        criteria: { storeId: 'STORE-001' },
      };

      const error = service.validateRequest(request);
      expect(error).toBeNull();
    });

    it('should accept valid request with multiple criteria', () => {
      const request: SearchRequest = {
        criteria: {
          storeId: 'STORE-001',
          sku: 'SKU-123',
          productName: 'Widget',
          priceMin: 10,
          priceMax: 50,
          dateStart: '2024-01-01',
          dateEnd: '2024-06-30',
        },
        pagination: { page: 1, pageSize: 50 },
        sort: { field: 'date', direction: SortDirection.Desc },
      };

      const error = service.validateRequest(request);
      expect(error).toBeNull();
    });

    it('should accept request with only priceMin criterion', () => {
      const request: SearchRequest = {
        criteria: { priceMin: 10 },
      };

      const error = service.validateRequest(request);
      expect(error).toBeNull();
    });

    it('should accept request with only priceMax criterion', () => {
      const request: SearchRequest = {
        criteria: { priceMax: 100 },
      };

      const error = service.validateRequest(request);
      expect(error).toBeNull();
    });

    it('should accept request with only dateStart criterion', () => {
      const request: SearchRequest = {
        criteria: { dateStart: '2024-01-01' },
      };

      const error = service.validateRequest(request);
      expect(error).toBeNull();
    });

    it('should accept request with only dateEnd criterion', () => {
      const request: SearchRequest = {
        criteria: { dateEnd: '2024-12-31' },
      };

      const error = service.validateRequest(request);
      expect(error).toBeNull();
    });
  });

  describe('buildSearchQuery', () => {
    describe('WHERE clause construction', () => {
      it('should build StoreID exact match condition', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('store_id = $1');
        expect(result.countParams).toContain('STORE-001');
      });

      it('should build SKU exact match condition', () => {
        const request: SearchRequest = {
          criteria: { sku: 'SKU-12345' },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('sku = $1');
        expect(result.countParams).toContain('SKU-12345');
      });

      it('should build Product Name ILIKE condition with wildcards', () => {
        const request: SearchRequest = {
          criteria: { productName: 'widget' },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('product_name ILIKE $1');
        expect(result.countParams).toContain('%widget%');
      });

      it('should build price minimum condition', () => {
        const request: SearchRequest = {
          criteria: { priceMin: 10.5 },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('price >= $1');
        expect(result.countParams).toContain(10.5);
      });

      it('should build price maximum condition', () => {
        const request: SearchRequest = {
          criteria: { priceMax: 99.99 },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('price <= $1');
        expect(result.countParams).toContain(99.99);
      });

      it('should build date start condition', () => {
        const request: SearchRequest = {
          criteria: { dateStart: '2024-01-01' },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('record_date >= $1');
        expect(result.countParams).toContain('2024-01-01');
      });

      it('should build date end condition', () => {
        const request: SearchRequest = {
          criteria: { dateEnd: '2024-06-30' },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('record_date <= $1');
        expect(result.countParams).toContain('2024-06-30');
      });

      it('should combine multiple criteria with AND', () => {
        const request: SearchRequest = {
          criteria: {
            storeId: 'STORE-001',
            sku: 'SKU-123',
            priceMin: 10,
            priceMax: 50,
          },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('WHERE');
        expect(result.sql).toContain('store_id = $1');
        expect(result.sql).toContain('sku = $2');
        expect(result.sql).toContain('price >= $3');
        expect(result.sql).toContain('price <= $4');
        expect(result.sql).toContain(' AND ');
        expect(result.countParams).toEqual(['STORE-001', 'SKU-123', 10, 50]);
      });

      it('should use parameterized queries (no raw values in SQL)', () => {
        const request: SearchRequest = {
          criteria: {
            storeId: "'; DROP TABLE pricing_records; --",
            productName: '<script>alert("xss")</script>',
          },
        };

        const result = service.buildSearchQuery(request);
        // The SQL should only contain $N placeholders, not raw values
        expect(result.sql).not.toContain("DROP TABLE");
        expect(result.sql).not.toContain('<script>');
        expect(result.sql).toContain('$1');
        expect(result.sql).toContain('$2');
        // Values are in params array, safely separated from SQL
        expect(result.countParams[0]).toBe("'; DROP TABLE pricing_records; --");
        expect(result.countParams[1]).toBe('%<script>alert("xss")</script>%');
      });
    });

    describe('pagination', () => {
      it('should use default page size of 50 when not specified', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
        };

        const result = service.buildSearchQuery(request);
        expect(result.pagination.pageSize).toBe(SEARCH_CONSTANTS.DEFAULT_PAGE_SIZE);
        expect(result.sql).toContain('LIMIT');
        // LIMIT value is the second-to-last param
        const limitParamIndex = result.params.length - 2;
        expect(result.params[limitParamIndex]).toBe(50);
      });

      it('should use default page 1 when not specified', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
        };

        const result = service.buildSearchQuery(request);
        expect(result.pagination.page).toBe(1);
        // OFFSET should be 0 for page 1
        const offsetParamIndex = result.params.length - 1;
        expect(result.params[offsetParamIndex]).toBe(0);
      });

      it('should calculate correct offset for page 3 with pageSize 50', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
          pagination: { page: 3, pageSize: 50 },
        };

        const result = service.buildSearchQuery(request);
        const offsetParamIndex = result.params.length - 1;
        expect(result.params[offsetParamIndex]).toBe(100); // (3-1) * 50
      });

      it('should cap pageSize to max 200 in query builder', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
          pagination: { page: 1, pageSize: 300 },
        };

        const result = service.buildSearchQuery(request);
        expect(result.pagination.pageSize).toBe(200);
        const limitParamIndex = result.params.length - 2;
        expect(result.params[limitParamIndex]).toBe(200);
      });

      it('should use specified pageSize when within range', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
          pagination: { page: 1, pageSize: 100 },
        };

        const result = service.buildSearchQuery(request);
        expect(result.pagination.pageSize).toBe(100);
        const limitParamIndex = result.params.length - 2;
        expect(result.params[limitParamIndex]).toBe(100);
      });
    });

    describe('sort', () => {
      it('should default to record_date DESC when sort not specified', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('ORDER BY record_date DESC');
      });

      it('should apply specified sort field and direction', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
          sort: { field: 'price', direction: SortDirection.Asc },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('ORDER BY price ASC');
      });

      it('should map "date" field to "record_date" column', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
          sort: { field: 'date', direction: SortDirection.Desc },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('ORDER BY record_date DESC');
      });

      it('should fallback to default sort field for unknown field', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
          sort: { field: 'unknown_field', direction: SortDirection.Asc },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('ORDER BY record_date ASC');
      });
    });

    describe('SQL structure', () => {
      it('should produce count query without LIMIT/OFFSET', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001' },
        };

        const result = service.buildSearchQuery(request);
        expect(result.countSql).toContain('SELECT COUNT(*)');
        expect(result.countSql).toContain('WHERE store_id = $1');
        expect(result.countSql).not.toContain('LIMIT');
        expect(result.countSql).not.toContain('OFFSET');
        expect(result.countSql).not.toContain('ORDER BY');
      });

      it('should produce data query with SELECT, WHERE, ORDER BY, LIMIT, OFFSET', () => {
        const request: SearchRequest = {
          criteria: { storeId: 'STORE-001', sku: 'SKU-123' },
          pagination: { page: 2, pageSize: 25 },
          sort: { field: 'price', direction: SortDirection.Asc },
        };

        const result = service.buildSearchQuery(request);
        expect(result.sql).toContain('SELECT * FROM pricing_records');
        expect(result.sql).toContain('WHERE store_id = $1 AND sku = $2');
        expect(result.sql).toContain('ORDER BY price ASC');
        expect(result.sql).toContain('LIMIT $3 OFFSET $4');
        expect(result.params).toEqual(['STORE-001', 'SKU-123', 25, 25]);
      });
    });
  });

  describe('buildPaginationMeta', () => {
    it('should compute totalPages correctly', () => {
      const meta = service.buildPaginationMeta(250, { page: 1, pageSize: 50 });

      expect(meta.totalRecords).toBe(250);
      expect(meta.totalPages).toBe(5);
      expect(meta.page).toBe(1);
      expect(meta.pageSize).toBe(50);
      expect(meta.truncated).toBe(false);
    });

    it('should round up totalPages for partial pages', () => {
      const meta = service.buildPaginationMeta(251, { page: 1, pageSize: 50 });

      expect(meta.totalPages).toBe(6);
    });

    it('should set truncated to true when total exceeds 10,000', () => {
      const meta = service.buildPaginationMeta(15000, { page: 1, pageSize: 50 });

      expect(meta.truncated).toBe(true);
      expect(meta.totalRecords).toBe(10000);
      expect(meta.totalPages).toBe(200); // 10000 / 50
    });

    it('should not truncate when total is exactly 10,000', () => {
      const meta = service.buildPaginationMeta(10000, { page: 1, pageSize: 50 });

      expect(meta.truncated).toBe(false);
      expect(meta.totalRecords).toBe(10000);
    });

    it('should set truncated when total is 10,001', () => {
      const meta = service.buildPaginationMeta(10001, { page: 1, pageSize: 50 });

      expect(meta.truncated).toBe(true);
      expect(meta.totalRecords).toBe(10000);
    });

    it('should handle zero results', () => {
      const meta = service.buildPaginationMeta(0, { page: 1, pageSize: 50 });

      expect(meta.totalRecords).toBe(0);
      expect(meta.totalPages).toBe(0);
      expect(meta.truncated).toBe(false);
    });

    it('should respect page and pageSize passed in', () => {
      const meta = service.buildPaginationMeta(500, { page: 3, pageSize: 100 });

      expect(meta.page).toBe(3);
      expect(meta.pageSize).toBe(100);
      expect(meta.totalPages).toBe(5);
    });
  });
});
