// ─── Enums ───────────────────────────────────────────────────────────────────

export enum UserRole {
  StoreOperator = 'store_operator',
  OperationsTeam = 'operations_team',
  Admin = 'admin',
}

export enum UploadStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Queued = 'queued',
}

export enum SortDirection {
  Asc = 'asc',
  Desc = 'desc',
}

// ─── Core Domain Interfaces ──────────────────────────────────────────────────

export interface PricingRecord {
  id: string;
  storeId: string;
  sku: string;
  productName: string;
  price: number;
  currency: string;
  recordDate: string; // ISO 8601 date: YYYY-MM-DD
  version: number;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  createdBy: string; // User ID (UUID)
  updatedBy: string; // User ID (UUID)
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  locale: string;
  failedLoginCount: number;
  lockedUntil: string | null; // ISO 8601 timestamp or null
  lastLoginAt: string | null; // ISO 8601 timestamp or null
  createdAt: string;
  updatedAt: string;
}

export interface Upload {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  totalRows: number | null;
  validRecords: number | null;
  rejectedRows: number | null;
  updatedRecords: number | null;
  status: UploadStatus;
  currency: string;
  uploadedBy: string; // User ID (UUID)
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface UploadRejection {
  id: string;
  uploadId: string;
  rowNumber: number;
  reasons: string[];
}

export interface AuditLogEntry {
  id: string;
  recordId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string; // User ID (UUID)
  changedAt: string; // ISO 8601 timestamp
  action: 'update' | 'upsert_upload';
}

export interface SecurityAuditLogEntry {
  id: string;
  userId: string | null;
  actionType: string;
  resourceType: string | null;
  resourceId: string | null;
  outcome: 'success' | 'failure';
  ipAddress: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

// ─── API Request Types ───────────────────────────────────────────────────────

export interface SearchCriteria {
  storeId?: string;
  sku?: string;
  productName?: string;
  priceMin?: number;
  priceMax?: number;
  dateStart?: string; // YYYY-MM-DD
  dateEnd?: string;   // YYYY-MM-DD
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface SortParams {
  field: string;
  direction: SortDirection;
}

export interface SearchRequest {
  criteria: SearchCriteria;
  pagination?: PaginationParams;
  sort?: SortParams;
}

export interface EditRequest {
  storeId: string;
  sku: string;
  productName: string;
  price: number;
  currency: string;
  date: string; // YYYY-MM-DD
  version: number;
}

// ─── API Response Types ──────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  truncated: boolean;
}

export interface SearchResponse {
  records: PricingRecord[];
  pagination: PaginationMeta;
}

export interface UploadSummary {
  totalRows: number;
  validRecords: number;
  rejectedRows: number;
  updatedRecords: number;
}

export interface RejectionDetail {
  row: number;
  reasons: string[];
}

export interface UploadResponse {
  uploadId: string;
  status: UploadStatus;
  summary: UploadSummary;
  rejections: RejectionDetail[];
}

// ─── Error Envelope ──────────────────────────────────────────────────────────

export interface ErrorDetail {
  field?: string;
  issue: string;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: ErrorDetail[];
  };
}
