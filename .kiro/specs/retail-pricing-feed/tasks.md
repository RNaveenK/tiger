# Implementation Plan: Retail Pricing Feed

## Overview

This implementation plan breaks down the Retail Pricing Feed system into incremental coding tasks. The system is a React + Node.js web application with PostgreSQL, Redis caching, message queue for upload resilience, streaming CSV parser workers, JWT authentication with RBAC, and optimistic locking for edits. Tasks are ordered so each builds on previous work, with property-based tests (fast-check) validating the 22 correctness properties defined in the design.

## Tasks

- [x] 1. Set up project structure, core interfaces, and database schema
  - [x] 1.1 Initialize project with Node.js backend and React frontend scaffolding
    - Create monorepo or workspace structure with `backend/` and `frontend/` directories
    - Initialize `package.json` with TypeScript, ESLint, Prettier
    - Set up `tsconfig.json` for both backend and frontend
    - Install core dependencies: Express/Fastify, pg, ioredis, fast-check, vitest
    - _Requirements: 6.1, 6.3_

  - [x] 1.2 Define shared TypeScript interfaces and types
    - Create `PricingRecord`, `User`, `Upload`, `AuditLogEntry` interfaces
    - Create enums for `UserRole`, `UploadStatus`, `SortDirection`
    - Define API request/response types: `SearchRequest`, `SearchResponse`, `EditRequest`, `UploadResponse`
    - Define error envelope type: `{ error: { code: string, message: string, details: [...] } }`
    - _Requirements: 1.1, 2.1, 3.1, 4.2_

  - [x] 1.3 Create database migration scripts
    - Write migration for `users` table with role check constraint
    - Write migration for `pricing_records` table with composite unique constraint, price check, currency check
    - Write migration for `audit_log` table with indexes
    - Write migration for `uploads` and `upload_rejections` tables
    - Write migration for `security_audit_log` table with indexes
    - Enable `pg_trgm` extension and create trigram GIN index on `product_name`
    - Create composite indexes: `(store_id, sku, record_date DESC)`, `(store_id)`, `(sku)`, `(record_date DESC)`
    - _Requirements: 5.1, 5.5, 2.2, 2.5_

  - [x] 1.4 Set up testing framework configuration
    - Configure Vitest with TypeScript support
    - Configure fast-check with `numRuns: 100, verbose: true`
    - Create test directory structure: `tests/unit/`, `tests/property/`, `tests/integration/`
    - Create test utilities and shared generators for fast-check (e.g., `arbitraryPricingRecord`, `arbitraryCsvRow`)
    - _Requirements: 6.1_

- [x] 2. Implement authentication and authorization
  - [x] 2.1 Implement AuthService with JWT issuance and session management
    - Create `AuthService` class with `login`, `logout`, `validateToken` methods
    - Implement password hashing with bcrypt
    - Implement JWT token generation (access token 15-min, refresh token)
    - Store JWT in HttpOnly cookie
    - Implement session timeout at 30-minute inactivity
    - _Requirements: 4.1, 4.5, 4.6_

  - [x] 2.2 Implement account lockout logic
    - Track consecutive failed login attempts per user
    - Lock account for 15 minutes after 5 consecutive failures within 30-minute window
    - Reset counter on successful login or lockout expiry
    - Return generic "authentication failed" message (no field disclosure)
    - Log lockout events and notify admin within 60 seconds
    - _Requirements: 4.7, 9.5, 9.6, 9.7_

  - [ ]* 2.3 Write property test for account lockout (Property 12)
    - **Property 12: Account lockout after consecutive failures**
    - **Validates: Requirements 4.7, 9.5**

  - [x] 2.4 Implement RBAC middleware
    - Create `authMiddleware` that validates JWT and attaches user context
    - Create `rbacMiddleware(allowedRoles)` that checks user role against permitted operations
    - Store Operator: upload + read-only search
    - Operations Team: search + view + edit
    - Return 403 with "insufficient permissions" on role violation
    - _Requirements: 4.2, 4.3, 4.4, 4.8_

  - [ ]* 2.5 Write property test for RBAC enforcement (Property 11)
    - **Property 11: RBAC enforcement**
    - **Validates: Requirements 4.3, 4.4, 4.8**

  - [x] 2.6 Implement security audit logging
    - Log all login/logout/upload/search/edit actions with timestamp, user ID, action type, resource identifiers, outcome
    - Persist to `security_audit_log` table
    - _Requirements: 9.3_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement CSV upload and parsing
  - [x] 4.1 Implement UploadService with file reception and validation
    - Accept multipart/form-data with CSV file and currency code
    - Validate file size ≤ 50 MB (reject with 413 if exceeded)
    - Validate row count ≤ 200,000 (reject with 422 if exceeded)
    - Validate currency code against ISO 4217 list
    - Create upload tracking record in `uploads` table with status `processing`
    - Return upload ID and initial status to client
    - _Requirements: 1.6, 1.7, 8.1, 8.2, 8.3_

  - [ ]* 4.2 Write property test for currency code validation (Property 16)
    - **Property 16: Currency code validation**
    - **Validates: Requirements 8.3**

  - [ ] 4.3 Implement streaming CSV parser worker
    - Use streaming CSV library (e.g., `csv-parse`) with backpressure handling
    - Validate header row contains required columns: StoreID, SKU, Product Name, Price, Date
    - Report missing columns if header validation fails
    - Process rows one-by-one; validate each row against rules:
      - StoreID and SKU non-empty
      - Price is numeric and within 0.01–999999.99
      - Date matches YYYY-MM-DD format
    - Collect rejected rows with row numbers and reasons
    - Apply half-up rounding to price values exceeding currency's minor unit precision
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 5.4_

  - [ ]* 4.4 Write property test for missing column detection (Property 2)
    - **Property 2: Missing column detection**
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 4.5 Write property test for row validation (Property 3)
    - **Property 3: Row validation identifies invalid data**
    - **Validates: Requirements 1.4**

  - [ ]* 4.6 Write property test for price rounding (Property 14)
    - **Property 14: Price rounding (half-up to currency precision)**
    - **Validates: Requirements 5.4, 8.1**

  - [ ] 4.7 Implement in-file deduplication and database upsert
    - For duplicate (StoreID, SKU, Date) within same file, keep only the last occurrence
    - Batch INSERT using PostgreSQL `ON CONFLICT (store_id, sku, record_date) DO UPDATE`
    - Use batch size of 1000 rows per INSERT statement
    - Track valid records, rejected rows, and updated records counts
    - Update upload status to `completed` with summary
    - _Requirements: 1.5, 1.8, 5.1, 5.2, 5.3_

  - [ ]* 4.8 Write property test for upload summary accounting (Property 1)
    - **Property 1: Upload summary accounting**
    - **Validates: Requirements 1.1**

  - [ ]* 4.9 Write property test for upsert on duplicate natural key (Property 4)
    - **Property 4: Upsert on duplicate natural key**
    - **Validates: Requirements 1.8, 5.1, 5.2**

  - [ ]* 4.10 Write property test for last-occurrence-wins deduplication (Property 13)
    - **Property 13: Last-occurrence-wins for in-file duplicates**
    - **Validates: Requirements 5.3**

  - [ ] 4.11 Implement message queue for upload resilience
    - Integrate Redis Streams (or chosen queue) for upload buffering
    - When DB is unavailable, enqueue upload payload (up to 10,000 queued)
    - Implement QueueProcessor worker that replays queued uploads in order on DB recovery
    - Return `queued` status to client when upload is enqueued
    - Reject new uploads with 503 when queue is at capacity
    - _Requirements: 7.2, 7.6_

- [ ] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement search functionality
  - [x] 6.1 Implement SearchService query builder
    - Build dynamic WHERE clauses from search criteria (StoreID exact, SKU exact, Product Name ILIKE, price range, date range)
    - Require at least one search criterion (reject with 400 if none)
    - Require Product Name query ≥ 2 characters
    - Use parameterized queries for all criteria (prevent SQL injection)
    - Apply pagination: default pageSize 50, max 200, reject > 200
    - Apply sort: default `record_date DESC`
    - Cap result set at 10,000 records; set `truncated: true` when exceeded
    - _Requirements: 2.1, 2.3, 2.5, 2.7, 2.8_

  - [ ]* 6.2 Write property test for search results satisfy all criteria (Property 5)
    - **Property 5: Search results satisfy all criteria**
    - **Validates: Requirements 2.1**

  - [ ]* 6.3 Write property test for search matching semantics (Property 7)
    - **Property 7: Search matching semantics**
    - **Validates: Requirements 2.5**

  - [ ]* 6.4 Write property test for pagination and sort invariant (Property 6)
    - **Property 6: Pagination and sort invariant**
    - **Validates: Requirements 2.3**

  - [ ]* 6.5 Write property test for result set capping (Property 8)
    - **Property 8: Result set capping**
    - **Validates: Requirements 2.8**

  - [ ] 6.6 Implement Redis caching layer for search
    - Cache query results in Redis with 60-second TTL
    - Generate cache key from normalized query parameters
    - Invalidate relevant cache entries on record edit/upload
    - Fall back to direct DB query on Redis unavailability
    - _Requirements: 2.2, 6.4_

  - [ ] 6.7 Implement search API endpoint and route
    - Create `POST /api/pricing-records/search` route
    - Wire to SearchService with auth middleware (authenticated users only)
    - Return paginated response with records, pagination metadata, and truncated flag
    - Return empty result set with message when no records match
    - _Requirements: 2.1, 2.4, 2.6_

- [ ] 7. Implement record editing with optimistic locking
  - [ ] 7.1 Implement EditService with field validation
    - Validate Price: numeric, 0.01–999,999,999.99
    - Validate Date: YYYY-MM-DD format
    - Validate all required fields non-empty (StoreID, SKU, Product Name, Price, Date)
    - Return field-level validation errors on failure (422)
    - _Requirements: 3.2, 3.3_

  - [ ]* 7.2 Write property test for edit validation correctness (Property 9)
    - **Property 9: Edit validation correctness**
    - **Validates: Requirements 3.2, 3.3**

  - [ ] 7.3 Implement optimistic locking mechanism
    - Include `version` in edit request payload
    - On save: `UPDATE ... SET version = version + 1 WHERE id = :id AND version = :expectedVersion`
    - If zero rows affected: return 409 Conflict with conflict info
    - Preserve user's unsaved changes in error response so frontend can retain them
    - _Requirements: 5.6, 5.7_

  - [ ]* 7.4 Write property test for optimistic locking conflict detection (Property 15)
    - **Property 15: Optimistic locking conflict detection**
    - **Validates: Requirements 5.6**

  - [ ] 7.5 Implement audit trail on edit
    - Compare old vs new field values for each changed field
    - Insert one `audit_log` entry per changed field: record_id, field_name, old_value, new_value, changed_by, changed_at, action='update'
    - _Requirements: 3.5_

  - [ ]* 7.6 Write property test for audit trail creation (Property 10)
    - **Property 10: Audit trail creation**
    - **Validates: Requirements 3.5**

  - [ ] 7.7 Implement edit API endpoint and route
    - Create `PUT /api/pricing-records/:id` route
    - Wire to EditService with auth + RBAC middleware (Operations Team only)
    - Return updated record on success, appropriate error codes on failure
    - Return `GET /api/pricing-records/:id` for single record retrieval
    - _Requirements: 3.1, 3.4, 3.6, 4.4_

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement input sanitization and data integrity
  - [ ] 9.1 Implement input sanitization middleware
    - Detect and reject SQL injection patterns (`'; DROP TABLE`, `1=1 OR`, `UNION SELECT`)
    - Detect and reject XSS patterns (`<script>`, `javascript:`, event handler attributes)
    - Apply to all user-facing endpoints before processing
    - Return 400 with sanitization error for rejected inputs
    - _Requirements: 9.4_

  - [ ]* 9.2 Write property test for input sanitization (Property 19)
    - **Property 19: Input sanitization**
    - **Validates: Requirements 9.4**

  - [ ] 9.3 Implement UTF-8 product name handling
    - Ensure all string operations preserve UTF-8 encoding
    - Enforce 500-character limit on Product Name
    - Verify round-trip: store and retrieve preserves exact original string
    - _Requirements: 8.4_

  - [ ]* 9.4 Write property test for UTF-8 product name round-trip (Property 17)
    - **Property 17: UTF-8 product name round-trip**
    - **Validates: Requirements 8.4**

  - [ ] 9.5 Implement date storage and locale-based display formatting
    - Store dates in ISO 8601 format (YYYY-MM-DD) in database
    - Format display output according to user's configured locale preference
    - _Requirements: 5.5, 8.5_

  - [ ]* 9.6 Write property test for date storage and display format (Property 18)
    - **Property 18: Date storage and display format**
    - **Validates: Requirements 5.5, 8.5**

- [ ] 10. Implement observability, health checks, and alerting
  - [ ] 10.1 Implement health check endpoint
    - Create `GET /api/health` endpoint (public)
    - Check connectivity to PostgreSQL, Redis, message queue
    - Return `{ status: 'healthy' | 'unhealthy', timestamp, dependencies: {...} }`
    - _Requirements: 10.1_

  - [ ] 10.2 Implement structured logging middleware
    - Log every API request: method, path, status code, response time (ms), user ID, request ID
    - Use JSON format for machine-parseable log aggregation
    - Include correlation ID across request lifecycle
    - _Requirements: 9.3, 10.2_

  - [ ]* 10.3 Write property test for structured logging completeness (Property 20)
    - **Property 20: Structured logging completeness**
    - **Validates: Requirements 9.3, 10.2**

  - [ ] 10.4 Implement metrics emitter
    - Emit Prometheus-format metrics for upload processing time, search response time, error rates
    - Calculate over 1-minute rolling window
    - Expose at `GET /api/metrics` (internal only)
    - _Requirements: 10.3_

  - [ ] 10.5 Implement alert triggering on consecutive health check failures
    - Monitor health check results; after 3 consecutive unhealthy responses, trigger alert
    - Send alert notification to operations team within 60 seconds of third failure
    - _Requirements: 10.4_

  - [ ]* 10.6 Write property test for alert after consecutive health check failures (Property 21)
    - **Property 21: Alert after consecutive health check failures**
    - **Validates: Requirements 10.4**

  - [ ] 10.7 Implement alert suppression deduplication
    - After sending an alert for a service, suppress duplicate alerts for same service within 5-minute window
    - Track last alert timestamp per service
    - _Requirements: 10.5_

  - [ ]* 10.8 Write property test for alert suppression deduplication (Property 22)
    - **Property 22: Alert suppression deduplication**
    - **Validates: Requirements 10.5**

- [ ] 11. Implement React frontend
  - [ ] 11.1 Implement AuthModule (login form and session management)
    - Create login form with username/password fields
    - Handle JWT token storage (HttpOnly cookie via API)
    - Detect session timeout and redirect to login on 401
    - Display account locked message with remaining duration
    - _Requirements: 4.1, 4.5, 4.6, 4.7_

  - [ ] 11.2 Implement UploadWidget
    - File selection with drag-and-drop support
    - Client-side pre-check: file size ≤ 50 MB
    - Currency code selection dropdown (ISO 4217 codes)
    - Progress bar during upload
    - Display upload summary: total rows, valid records, rejected rows, updated records
    - Display rejection details with row numbers and reasons
    - _Requirements: 1.1, 1.6, 8.2_

  - [ ] 11.3 Implement SearchPanel
    - Multi-criteria search form: StoreID, SKU, Product Name, Price min/max, Date start/end
    - Pagination controls with configurable page size (default 50, max 200)
    - Result table displaying StoreID, SKU, Product Name, Price, Date
    - Empty state with "no records matched" message
    - Truncation indicator when results exceed 10,000
    - _Requirements: 2.1, 2.3, 2.4, 2.6, 2.8_

  - [ ] 11.4 Implement RecordEditor with optimistic lock support
    - Inline edit form for all fields (StoreID, SKU, Product Name, Price, Date)
    - Client-side field validation with error messages per field
    - Track version for optimistic locking
    - Display conflict notification on 409 response; preserve user's unsaved changes
    - Display success confirmation on successful save
    - Display error message on save failure; retain modifications
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 5.6, 5.7_

  - [ ] 11.5 Implement LocaleProvider and NotificationBanner
    - Date/number formatting per user locale settings
    - Success/error/conflict notification banner component
    - _Requirements: 8.5_

- [ ] 12. Integration wiring and API routes
  - [ ] 12.1 Wire all API routes with middleware chain
    - Mount all routes: auth, uploads, search, edit, health, metrics
    - Apply middleware chain: logging → auth → RBAC → rate limiting → handler
    - Configure CORS, helmet for security headers, gzip compression
    - Implement consistent error envelope for all error responses
    - _Requirements: 9.1, 9.4, 6.1_

  - [ ] 12.2 Implement connection pooling and graceful shutdown
    - Configure PostgreSQL connection pool (pgBouncer or pg pool)
    - Configure Redis connection with retry logic
    - Implement graceful shutdown: drain connections, finish in-flight requests
    - _Requirements: 6.1, 6.5, 7.1_

  - [ ]* 12.3 Write integration tests for end-to-end flows
    - Test complete upload → persist → search → edit flow
    - Test auth flow: login → access protected route → session timeout → re-auth
    - Test concurrent edit conflict scenario
    - Test upload queue behavior during DB unavailability
    - _Requirements: 1.1, 2.1, 3.4, 4.1, 5.6, 7.2_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key integration points
- Property tests validate the 22 universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- The frontend tasks (section 11) can be developed in parallel with backend integration (section 12) once API contracts are defined
- All database operations use parameterized queries to prevent SQL injection
- The streaming CSV parser uses backpressure to avoid OOM on large files

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "2.4"] },
    { "id": 3, "tasks": ["2.2", "2.5", "2.6"] },
    { "id": 4, "tasks": ["2.3"] },
    { "id": 5, "tasks": ["4.1", "6.1"] },
    { "id": 6, "tasks": ["4.2", "4.3", "6.6"] },
    { "id": 7, "tasks": ["4.4", "4.5", "4.6", "4.7", "6.2", "6.3", "6.4", "6.5", "6.7"] },
    { "id": 8, "tasks": ["4.8", "4.9", "4.10", "4.11"] },
    { "id": 9, "tasks": ["7.1"] },
    { "id": 10, "tasks": ["7.2", "7.3", "7.5"] },
    { "id": 11, "tasks": ["7.4", "7.6", "7.7"] },
    { "id": 12, "tasks": ["9.1", "9.3", "9.5"] },
    { "id": 13, "tasks": ["9.2", "9.4", "9.6"] },
    { "id": 14, "tasks": ["10.1", "10.2", "10.4"] },
    { "id": 15, "tasks": ["10.3", "10.5"] },
    { "id": 16, "tasks": ["10.6", "10.7"] },
    { "id": 17, "tasks": ["10.8"] },
    { "id": 18, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 19, "tasks": ["12.1", "12.2"] },
    { "id": 20, "tasks": ["12.3"] }
  ]
}
```
