/**
 * Shared fast-check arbitraries (generators) for property-based tests.
 *
 * These generators produce valid domain objects that conform to the
 * TypeScript interfaces defined in src/types/index.ts and the data
 * constraints from the design document.
 */
import fc from 'fast-check';
import {
  UserRole,
  UploadStatus,
  SortDirection,
} from '../../src/types/index.js';
import type {
  PricingRecord,
  User,
  SearchRequest,
  SearchCriteria,
  PaginationParams,
  SortParams,
  EditRequest,
} from '../../src/types/index.js';

// ─── Primitive Generators ────────────────────────────────────────────────────

/** Generate a valid UUID v4 string */
export const arbitraryUuid = (): fc.Arbitrary<string> =>
  fc.uuid();

/** Generate a valid ISO 8601 date string (YYYY-MM-DD) */
export const arbitraryIsoDate = (): fc.Arbitrary<string> =>
  fc
    .date({
      min: new Date('2020-01-01'),
      max: new Date('2030-12-31'),
    })
    .map((d) => d.toISOString().slice(0, 10));

/** Generate a valid ISO 8601 timestamp string */
export const arbitraryIsoTimestamp = (): fc.Arbitrary<string> =>
  fc
    .date({
      min: new Date('2020-01-01T00:00:00Z'),
      max: new Date('2030-12-31T23:59:59Z'),
    })
    .map((d) => d.toISOString());

/** Generate a valid ISO 4217 three-letter currency code */
export const arbitraryCurrencyCode = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY',
    'SEK', 'NZD', 'MXN', 'SGD', 'HKD', 'NOK', 'KRW', 'TRY',
    'INR', 'BRL', 'ZAR', 'DKK'
  );

/** Generate an invalid currency code (not a valid ISO 4217 code) */
export const arbitraryInvalidCurrencyCode = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 3, maxLength: 3 }),
    fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 1, maxLength: 2 }),
    fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 4, maxLength: 5 }),
    fc.constant(''),
    fc.constant('123'),
    fc.constant('US1')
  );

/** Generate a valid price within the allowed range (0.01 to 999999999.99) */
export const arbitraryPrice = (): fc.Arbitrary<number> =>
  fc.double({ min: 0.01, max: 999999999.99, noNaN: true }).map((v) =>
    Math.round(v * 100) / 100
  );

/** Generate a valid price within CSV upload range (0.01 to 999999.99) */
export const arbitraryCsvPrice = (): fc.Arbitrary<number> =>
  fc.double({ min: 0.01, max: 999999.99, noNaN: true }).map((v) =>
    Math.round(v * 100) / 100
  );

/** Generate a valid StoreID (non-empty alphanumeric with optional dashes) */
export const arbitraryStoreId = (): fc.Arbitrary<string> =>
  fc
    .stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'.split('')), {
      minLength: 3,
      maxLength: 20,
    })
    .filter((s) => /^[A-Z0-9]/.test(s) && s.trim().length > 0);

/** Generate a valid SKU (non-empty alphanumeric with optional dashes) */
export const arbitrarySku = (): fc.Arbitrary<string> =>
  fc
    .stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'.split('')), {
      minLength: 3,
      maxLength: 30,
    })
    .filter((s) => /^[A-Z0-9]/.test(s) && s.trim().length > 0);

/** Generate a valid product name (non-empty UTF-8, up to 500 chars) */
export const arbitraryProductName = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

/** Generate a product name with international characters */
export const arbitraryUnicodeProductName = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    fc.constantFrom(
      'Café Latte Premium',
      'Ñoño Special Widget',
      '日本語テスト製品',
      '中文产品名称',
      'Ürünüm Güzel',
      'Produit Spécial été',
      'Müsli Überraschung',
      'Íslenski vörumerki',
      '한국어 제품명',
      'Ελληνικό Προϊόν'
    )
  );

/** Generate a valid username */
export const arbitraryUsername = (): fc.Arbitrary<string> =>
  fc
    .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._'.split('')), {
      minLength: 3,
      maxLength: 50,
    })
    .filter((s) => /^[a-z]/.test(s));

/** Generate a valid user role */
export const arbitraryUserRole = (): fc.Arbitrary<UserRole> =>
  fc.constantFrom(UserRole.StoreOperator, UserRole.OperationsTeam, UserRole.Admin);

/** Generate a valid locale string */
export const arbitraryLocale = (): fc.Arbitrary<string> =>
  fc.constantFrom('en-US', 'en-GB', 'fr-FR', 'de-DE', 'ja-JP', 'es-ES', 'zh-CN', 'ko-KR');

// ─── Domain Object Generators ────────────────────────────────────────────────

/** Generate a valid PricingRecord */
export const arbitraryPricingRecord = (): fc.Arbitrary<PricingRecord> =>
  fc.record({
    id: arbitraryUuid(),
    storeId: arbitraryStoreId(),
    sku: arbitrarySku(),
    productName: arbitraryProductName(),
    price: arbitraryPrice(),
    currency: arbitraryCurrencyCode(),
    recordDate: arbitraryIsoDate(),
    version: fc.nat({ max: 100 }).map((n) => n + 1),
    createdAt: arbitraryIsoTimestamp(),
    updatedAt: arbitraryIsoTimestamp(),
    createdBy: arbitraryUuid(),
    updatedBy: arbitraryUuid(),
  });

/** Generate a valid User */
export const arbitraryUser = (): fc.Arbitrary<User> =>
  fc.record({
    id: arbitraryUuid(),
    username: arbitraryUsername(),
    passwordHash: fc.constant('$2b$10$hashedpasswordplaceholder'),
    role: arbitraryUserRole(),
    locale: arbitraryLocale(),
    failedLoginCount: fc.nat({ max: 10 }),
    lockedUntil: fc.oneof(fc.constant(null), arbitraryIsoTimestamp()),
    lastLoginAt: fc.oneof(fc.constant(null), arbitraryIsoTimestamp()),
    createdAt: arbitraryIsoTimestamp(),
    updatedAt: arbitraryIsoTimestamp(),
  });

// ─── CSV Row Generators ──────────────────────────────────────────────────────

/** Represents a raw CSV row as string fields */
export interface CsvRow {
  StoreID: string;
  SKU: string;
  'Product Name': string;
  Price: string;
  Date: string;
}

/** Generate a valid CSV row (all fields valid) */
export const arbitraryCsvRow = (): fc.Arbitrary<CsvRow> =>
  fc.record({
    StoreID: arbitraryStoreId(),
    SKU: arbitrarySku(),
    'Product Name': arbitraryProductName(),
    Price: arbitraryCsvPrice().map((p) => p.toFixed(2)),
    Date: arbitraryIsoDate(),
  });

/** Generate a CSV row with an invalid price */
export const arbitraryCsvRowInvalidPrice = (): fc.Arbitrary<CsvRow> =>
  fc.record({
    StoreID: arbitraryStoreId(),
    SKU: arbitrarySku(),
    'Product Name': arbitraryProductName(),
    Price: fc.oneof(
      fc.constant('not-a-number'),
      fc.constant(''),
      fc.constant('-5.00'),
      fc.constant('0.00'),
      fc.constant('0.001'),
      fc.constant('1000000.00'),
      fc.constant('abc123')
    ),
    Date: arbitraryIsoDate(),
  });

/** Generate a CSV row with an invalid date */
export const arbitraryCsvRowInvalidDate = (): fc.Arbitrary<CsvRow> =>
  fc.record({
    StoreID: arbitraryStoreId(),
    SKU: arbitrarySku(),
    'Product Name': arbitraryProductName(),
    Price: arbitraryCsvPrice().map((p) => p.toFixed(2)),
    Date: fc.oneof(
      fc.constant('not-a-date'),
      fc.constant(''),
      fc.constant('2024/01/15'),
      fc.constant('15-01-2024'),
      fc.constant('01-15-2024'),
      fc.constant('2024-13-01'),
      fc.constant('2024-01-32')
    ),
  });

/** Generate a CSV row with empty required fields */
export const arbitraryCsvRowEmptyFields = (): fc.Arbitrary<CsvRow> =>
  fc.record({
    StoreID: fc.oneof(fc.constant(''), arbitraryStoreId()),
    SKU: fc.oneof(fc.constant(''), arbitrarySku()),
    'Product Name': arbitraryProductName(),
    Price: arbitraryCsvPrice().map((p) => p.toFixed(2)),
    Date: arbitraryIsoDate(),
  }).filter((row) => row.StoreID === '' || row.SKU === '');

/** Required CSV column names */
export const CSV_REQUIRED_COLUMNS = ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'] as const;

/** Generate a subset of required columns (at least one missing) */
export const arbitraryMissingColumns = (): fc.Arbitrary<string[]> =>
  fc
    .subarray([...CSV_REQUIRED_COLUMNS], { minLength: 1, maxLength: 4 })
    .map((present) =>
      CSV_REQUIRED_COLUMNS.filter((col) => !present.includes(col))
    )
    .filter((missing) => missing.length > 0);

// ─── API Request Generators ──────────────────────────────────────────────────

/** Generate valid search criteria (at least one criterion specified) */
export const arbitrarySearchCriteria = (): fc.Arbitrary<SearchCriteria> =>
  fc
    .record({
      storeId: fc.option(arbitraryStoreId(), { nil: undefined }),
      sku: fc.option(arbitrarySku(), { nil: undefined }),
      productName: fc.option(
        fc.string({ minLength: 2, maxLength: 50 }).filter((s) => s.trim().length >= 2),
        { nil: undefined }
      ),
      priceMin: fc.option(
        fc.double({ min: 0.01, max: 500000, noNaN: true }).map((v) => Math.round(v * 100) / 100),
        { nil: undefined }
      ),
      priceMax: fc.option(
        fc.double({ min: 0.01, max: 999999999.99, noNaN: true }).map((v) => Math.round(v * 100) / 100),
        { nil: undefined }
      ),
      dateStart: fc.option(arbitraryIsoDate(), { nil: undefined }),
      dateEnd: fc.option(arbitraryIsoDate(), { nil: undefined }),
    })
    .filter(
      (c) =>
        c.storeId !== undefined ||
        c.sku !== undefined ||
        c.productName !== undefined ||
        c.priceMin !== undefined ||
        c.priceMax !== undefined ||
        c.dateStart !== undefined ||
        c.dateEnd !== undefined
    );

/** Generate valid pagination params */
export const arbitraryPaginationParams = (): fc.Arbitrary<PaginationParams> =>
  fc.record({
    page: fc.integer({ min: 1, max: 1000 }),
    pageSize: fc.integer({ min: 1, max: 200 }),
  });

/** Generate valid sort params */
export const arbitrarySortParams = (): fc.Arbitrary<SortParams> =>
  fc.record({
    field: fc.constantFrom('date', 'price', 'storeId', 'sku', 'productName'),
    direction: fc.constantFrom(SortDirection.Asc, SortDirection.Desc),
  });

/** Generate a valid SearchRequest */
export const arbitrarySearchRequest = (): fc.Arbitrary<SearchRequest> =>
  fc.record({
    criteria: arbitrarySearchCriteria(),
    pagination: fc.option(arbitraryPaginationParams(), { nil: undefined }),
    sort: fc.option(arbitrarySortParams(), { nil: undefined }),
  });

/** Generate a valid EditRequest */
export const arbitraryEditRequest = (): fc.Arbitrary<EditRequest> =>
  fc.record({
    storeId: arbitraryStoreId(),
    sku: arbitrarySku(),
    productName: arbitraryProductName(),
    price: arbitraryPrice(),
    currency: arbitraryCurrencyCode(),
    date: arbitraryIsoDate(),
    version: fc.nat({ max: 100 }).map((n) => n + 1),
  });
