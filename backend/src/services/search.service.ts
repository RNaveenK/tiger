import {
  SearchRequest,
  SearchResponse,
  SearchCriteria,
  PaginationParams,
  SortParams,
  SortDirection,
  PricingRecord,
  PaginationMeta,
  ErrorEnvelope,
} from '../types/index.js';

// ─── Configuration ───────────────────────────────────────────────────────────

export const SEARCH_CONSTANTS = {
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,
  MAX_RESULT_SET: 10_000,
  MIN_PRODUCT_NAME_LENGTH: 2,
  DEFAULT_SORT_FIELD: 'record_date',
  DEFAULT_SORT_DIRECTION: SortDirection.Desc,
} as const;

// ─── Valid Sort Fields ───────────────────────────────────────────────────────

const VALID_SORT_FIELDS: Record<string, string> = {
  date: 'record_date',
  record_date: 'record_date',
  store_id: 'store_id',
  storeId: 'store_id',
  sku: 'sku',
  product_name: 'product_name',
  productName: 'product_name',
  price: 'price',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueryBuilderResult {
  whereClause: string;
  params: unknown[];
  orderByClause: string;
  limitClause: string;
  offset: number;
  limit: number;
}

export interface SearchValidationError {
  code: string;
  message: string;
  details: Array<{ field?: string; issue: string }>;
}

export interface SearchQueryResult {
  sql: string;
  countSql: string;
  params: unknown[];
  countParams: unknown[];
  pagination: { page: number; pageSize: number };
}

// ─── SearchService ───────────────────────────────────────────────────────────

export class SearchService {
  /**
   * Validate search request and return error if invalid.
   * Returns null if the request is valid.
   */
  validateRequest(request: SearchRequest): SearchValidationError | null {
    const { criteria, pagination } = request;

    // Validate at least one search criterion is provided
    if (!this.hasAtLeastOneCriterion(criteria)) {
      return {
        code: 'SEARCH_NO_CRITERIA',
        message: 'At least one search field is required',
        details: [{ issue: 'At least one search field is required' }],
      };
    }

    // Validate Product Name minimum length
    if (
      criteria.productName !== undefined &&
      criteria.productName.length < SEARCH_CONSTANTS.MIN_PRODUCT_NAME_LENGTH
    ) {
      return {
        code: 'SEARCH_PRODUCT_NAME_TOO_SHORT',
        message: `Product Name query must be at least ${SEARCH_CONSTANTS.MIN_PRODUCT_NAME_LENGTH} characters`,
        details: [
          {
            field: 'productName',
            issue: `Product Name query must be at least ${SEARCH_CONSTANTS.MIN_PRODUCT_NAME_LENGTH} characters`,
          },
        ],
      };
    }

    // Validate pageSize max
    if (pagination && pagination.pageSize > SEARCH_CONSTANTS.MAX_PAGE_SIZE) {
      return {
        code: 'SEARCH_PAGE_SIZE_EXCEEDED',
        message: `Page size cannot exceed ${SEARCH_CONSTANTS.MAX_PAGE_SIZE}`,
        details: [
          {
            field: 'pageSize',
            issue: `Page size cannot exceed ${SEARCH_CONSTANTS.MAX_PAGE_SIZE}`,
          },
        ],
      };
    }

    return null;
  }

  /**
   * Build the complete search query with WHERE, ORDER BY, LIMIT/OFFSET clauses.
   * Returns parameterized SQL strings and parameter arrays.
   */
  buildSearchQuery(request: SearchRequest): SearchQueryResult {
    const { criteria, pagination, sort } = request;

    const resolvedPagination = this.resolvePagination(pagination);
    const resolvedSort = this.resolveSort(sort);

    // Build WHERE clause
    const { whereClause, params } = this.buildWhereClause(criteria);

    // Build ORDER BY clause
    const orderByClause = this.buildOrderByClause(resolvedSort);

    // Build LIMIT/OFFSET
    const offset = (resolvedPagination.page - 1) * resolvedPagination.pageSize;
    const limit = resolvedPagination.pageSize;

    // Data query
    const sql = `SELECT * FROM pricing_records${whereClause} ${orderByClause} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const queryParams = [...params, limit, offset];

    // Count query (for pagination metadata)
    const countSql = `SELECT COUNT(*) AS total FROM pricing_records${whereClause}`;
    const countParams = [...params];

    return {
      sql,
      countSql,
      params: queryParams,
      countParams,
      pagination: resolvedPagination,
    };
  }

  /**
   * Build pagination metadata from a total count and request pagination.
   * Caps total at MAX_RESULT_SET and sets truncated flag accordingly.
   */
  buildPaginationMeta(
    totalRecords: number,
    pagination: { page: number; pageSize: number }
  ): PaginationMeta {
    const truncated = totalRecords > SEARCH_CONSTANTS.MAX_RESULT_SET;
    const cappedTotal = truncated ? SEARCH_CONSTANTS.MAX_RESULT_SET : totalRecords;

    const totalPages = Math.ceil(cappedTotal / pagination.pageSize);

    return {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalRecords: cappedTotal,
      totalPages,
      truncated,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Check if at least one meaningful criterion is provided.
   */
  private hasAtLeastOneCriterion(criteria: SearchCriteria): boolean {
    return (
      (criteria.storeId !== undefined && criteria.storeId !== '') ||
      (criteria.sku !== undefined && criteria.sku !== '') ||
      (criteria.productName !== undefined && criteria.productName !== '') ||
      criteria.priceMin !== undefined ||
      criteria.priceMax !== undefined ||
      (criteria.dateStart !== undefined && criteria.dateStart !== '') ||
      (criteria.dateEnd !== undefined && criteria.dateEnd !== '')
    );
  }

  /**
   * Build the WHERE clause from search criteria using parameterized queries.
   */
  private buildWhereClause(criteria: SearchCriteria): {
    whereClause: string;
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    // StoreID - exact match
    if (criteria.storeId !== undefined && criteria.storeId !== '') {
      params.push(criteria.storeId);
      conditions.push(`store_id = $${params.length}`);
    }

    // SKU - exact match
    if (criteria.sku !== undefined && criteria.sku !== '') {
      params.push(criteria.sku);
      conditions.push(`sku = $${params.length}`);
    }

    // Product Name - case-insensitive substring (ILIKE)
    if (criteria.productName !== undefined && criteria.productName !== '') {
      params.push(`%${criteria.productName}%`);
      conditions.push(`product_name ILIKE $${params.length}`);
    }

    // Price range - minimum
    if (criteria.priceMin !== undefined) {
      params.push(criteria.priceMin);
      conditions.push(`price >= $${params.length}`);
    }

    // Price range - maximum
    if (criteria.priceMax !== undefined) {
      params.push(criteria.priceMax);
      conditions.push(`price <= $${params.length}`);
    }

    // Date range - start
    if (criteria.dateStart !== undefined && criteria.dateStart !== '') {
      params.push(criteria.dateStart);
      conditions.push(`record_date >= $${params.length}`);
    }

    // Date range - end
    if (criteria.dateEnd !== undefined && criteria.dateEnd !== '') {
      params.push(criteria.dateEnd);
      conditions.push(`record_date <= $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    return { whereClause, params };
  }

  /**
   * Build the ORDER BY clause from sort parameters.
   */
  private buildOrderByClause(sort: { field: string; direction: SortDirection }): string {
    const column = VALID_SORT_FIELDS[sort.field] || SEARCH_CONSTANTS.DEFAULT_SORT_FIELD;
    const direction = sort.direction === SortDirection.Asc ? 'ASC' : 'DESC';
    return `ORDER BY ${column} ${direction}`;
  }

  /**
   * Resolve pagination defaults.
   */
  private resolvePagination(
    pagination?: PaginationParams
  ): { page: number; pageSize: number } {
    const page = pagination?.page && pagination.page >= 1 ? pagination.page : 1;
    const pageSize =
      pagination?.pageSize && pagination.pageSize >= 1
        ? Math.min(pagination.pageSize, SEARCH_CONSTANTS.MAX_PAGE_SIZE)
        : SEARCH_CONSTANTS.DEFAULT_PAGE_SIZE;

    return { page, pageSize };
  }

  /**
   * Resolve sort defaults.
   */
  private resolveSort(
    sort?: SortParams
  ): { field: string; direction: SortDirection } {
    return {
      field: sort?.field || SEARCH_CONSTANTS.DEFAULT_SORT_FIELD,
      direction: sort?.direction || SEARCH_CONSTANTS.DEFAULT_SORT_DIRECTION,
    };
  }
}

// Export singleton instance
export const searchService = new SearchService();
