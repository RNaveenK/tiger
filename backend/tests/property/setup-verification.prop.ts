/**
 * Smoke test to verify fast-check configuration and shared generators work correctly.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PBT_CONFIG } from '../helpers/fc-config.js';
import {
  arbitraryPricingRecord,
  arbitraryCsvRow,
  arbitraryUser,
  arbitrarySearchRequest,
  arbitraryEditRequest,
  arbitraryCurrencyCode,
  arbitraryIsoDate,
  arbitraryPrice,
  arbitraryStoreId,
  arbitrarySku,
} from '../helpers/arbitraries.js';

describe('Testing framework verification', () => {
  it('fast-check config has expected values', () => {
    expect(PBT_CONFIG.numRuns).toBe(100);
    expect(PBT_CONFIG.verbose).toBe(true);
  });

  it('arbitraryPricingRecord generates valid records', () => {
    fc.assert(
      fc.property(arbitraryPricingRecord(), (record) => {
        expect(record.id).toBeTruthy();
        expect(record.storeId.trim().length).toBeGreaterThan(0);
        expect(record.sku.trim().length).toBeGreaterThan(0);
        expect(record.productName.trim().length).toBeGreaterThan(0);
        expect(record.price).toBeGreaterThanOrEqual(0.01);
        expect(record.price).toBeLessThanOrEqual(999999999.99);
        expect(record.currency).toMatch(/^[A-Z]{3}$/);
        expect(record.recordDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(record.version).toBeGreaterThanOrEqual(1);
      }),
      PBT_CONFIG
    );
  });

  it('arbitraryCsvRow generates valid CSV rows', () => {
    fc.assert(
      fc.property(arbitraryCsvRow(), (row) => {
        expect(row.StoreID.trim().length).toBeGreaterThan(0);
        expect(row.SKU.trim().length).toBeGreaterThan(0);
        expect(row['Product Name'].trim().length).toBeGreaterThan(0);
        expect(parseFloat(row.Price)).toBeGreaterThanOrEqual(0.01);
        expect(row.Date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }),
      PBT_CONFIG
    );
  });

  it('arbitraryUser generates valid users', () => {
    fc.assert(
      fc.property(arbitraryUser(), (user) => {
        expect(user.id).toBeTruthy();
        expect(user.username.trim().length).toBeGreaterThan(0);
        expect(['store_operator', 'operations_team', 'admin']).toContain(user.role);
        expect(user.failedLoginCount).toBeGreaterThanOrEqual(0);
      }),
      PBT_CONFIG
    );
  });

  it('arbitrarySearchRequest generates valid search requests', () => {
    fc.assert(
      fc.property(arbitrarySearchRequest(), (request) => {
        const criteria = request.criteria;
        // At least one criterion must be specified
        const hasCriterion =
          criteria.storeId !== undefined ||
          criteria.sku !== undefined ||
          criteria.productName !== undefined ||
          criteria.priceMin !== undefined ||
          criteria.priceMax !== undefined ||
          criteria.dateStart !== undefined ||
          criteria.dateEnd !== undefined;
        expect(hasCriterion).toBe(true);

        // Pagination if present must be valid
        if (request.pagination) {
          expect(request.pagination.page).toBeGreaterThanOrEqual(1);
          expect(request.pagination.pageSize).toBeGreaterThanOrEqual(1);
          expect(request.pagination.pageSize).toBeLessThanOrEqual(200);
        }
      }),
      PBT_CONFIG
    );
  });

  it('arbitraryEditRequest generates valid edit requests', () => {
    fc.assert(
      fc.property(arbitraryEditRequest(), (request) => {
        expect(request.storeId.trim().length).toBeGreaterThan(0);
        expect(request.sku.trim().length).toBeGreaterThan(0);
        expect(request.productName.trim().length).toBeGreaterThan(0);
        expect(request.price).toBeGreaterThanOrEqual(0.01);
        expect(request.currency).toMatch(/^[A-Z]{3}$/);
        expect(request.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(request.version).toBeGreaterThanOrEqual(1);
      }),
      PBT_CONFIG
    );
  });
});
