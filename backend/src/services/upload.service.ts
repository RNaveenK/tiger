import { v4 as uuidv4 } from 'uuid';
import { Upload, UploadStatus } from '../types/index.js';
import { isValidCurrencyCode } from '../utils/currency-codes.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 52_428_800; // 50 MB
const MAX_ROW_COUNT = 200_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UploadFileMetadata {
  fileName: string;
  fileSizeBytes: number;
  rowCount?: number;
}

export interface UploadInitiationRequest {
  file: UploadFileMetadata;
  currency: string;
  uploadedBy: string;
}

export interface UploadInitiationResult {
  uploadId: string;
  status: UploadStatus;
}

export interface UploadValidationError {
  code: string;
  message: string;
  details: Array<{ field?: string; issue: string }>;
}

// ─── Upload Store ────────────────────────────────────────────────────────────

/**
 * In-memory upload tracking store. In production, this would be backed by PostgreSQL.
 */
const uploads = new Map<string, Upload>();

// ─── UploadService ───────────────────────────────────────────────────────────

export class UploadService {
  /**
   * Validate and initiate a file upload.
   *
   * Performs the following checks:
   * 1. File size ≤ 50 MB (rejects with 413 if exceeded)
   * 2. Row count ≤ 200,000 (rejects with 422 if exceeded)
   * 3. Currency code is a valid ISO 4217 code (rejects with 422 if invalid)
   *
   * On success, creates a tracking record with status 'processing' and returns the upload ID.
   */
  initiateUpload(
    request: UploadInitiationRequest
  ): UploadInitiationResult | UploadValidationError {
    // Validate file size
    const fileSizeError = this.validateFileSize(request.file.fileSizeBytes);
    if (fileSizeError) {
      return fileSizeError;
    }

    // Validate row count (if provided)
    if (request.file.rowCount !== undefined) {
      const rowCountError = this.validateRowCount(request.file.rowCount);
      if (rowCountError) {
        return rowCountError;
      }
    }

    // Validate currency code
    const currencyError = this.validateCurrencyCode(request.currency);
    if (currencyError) {
      return currencyError;
    }

    // Create upload tracking record
    const uploadId = uuidv4();
    const now = new Date().toISOString();

    const upload: Upload = {
      id: uploadId,
      fileName: request.file.fileName,
      fileSizeBytes: request.file.fileSizeBytes,
      totalRows: request.file.rowCount ?? null,
      validRecords: null,
      rejectedRows: null,
      updatedRecords: null,
      status: UploadStatus.Processing,
      currency: request.currency,
      uploadedBy: request.uploadedBy,
      startedAt: now,
      completedAt: null,
      errorMessage: null,
      createdAt: now,
    };

    uploads.set(uploadId, upload);

    return {
      uploadId,
      status: UploadStatus.Processing,
    };
  }

  /**
   * Validate that file size does not exceed the maximum allowed (50 MB).
   */
  validateFileSize(fileSizeBytes: number): UploadValidationError | null {
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      return {
        code: 'FILE_TOO_LARGE',
        message: `File size exceeds maximum allowed size of 50 MB`,
        details: [
          {
            field: 'file',
            issue: `File size ${fileSizeBytes} bytes exceeds limit of ${MAX_FILE_SIZE_BYTES} bytes (50 MB)`,
          },
        ],
      };
    }
    return null;
  }

  /**
   * Validate that row count does not exceed the maximum allowed (200,000).
   */
  validateRowCount(rowCount: number): UploadValidationError | null {
    if (rowCount > MAX_ROW_COUNT) {
      return {
        code: 'ROW_LIMIT_EXCEEDED',
        message: `File exceeds maximum allowed row count of 200,000`,
        details: [
          {
            field: 'file',
            issue: `Row count ${rowCount} exceeds limit of ${MAX_ROW_COUNT} rows`,
          },
        ],
      };
    }
    return null;
  }

  /**
   * Validate that the currency code is a valid ISO 4217 code.
   */
  validateCurrencyCode(currency: string): UploadValidationError | null {
    if (!isValidCurrencyCode(currency)) {
      return {
        code: 'INVALID_CURRENCY',
        message: `Invalid currency code: ${currency}`,
        details: [
          {
            field: 'currency',
            issue: `'${currency}' is not a valid ISO 4217 currency code`,
          },
        ],
      };
    }
    return null;
  }

  /**
   * Get an upload record by ID.
   */
  getUpload(uploadId: string): Upload | null {
    return uploads.get(uploadId) ?? null;
  }

  /**
   * Update an upload record's status.
   */
  updateUploadStatus(uploadId: string, status: UploadStatus, errorMessage?: string): boolean {
    const upload = uploads.get(uploadId);
    if (!upload) {
      return false;
    }

    upload.status = status;
    if (errorMessage) {
      upload.errorMessage = errorMessage;
    }
    if (status === UploadStatus.Completed || status === UploadStatus.Failed) {
      upload.completedAt = new Date().toISOString();
    }

    return true;
  }

  /**
   * Clear all uploads (for testing purposes).
   */
  clearUploads(): void {
    uploads.clear();
  }

  /**
   * Get maximum file size in bytes.
   */
  getMaxFileSizeBytes(): number {
    return MAX_FILE_SIZE_BYTES;
  }

  /**
   * Get maximum row count.
   */
  getMaxRowCount(): number {
    return MAX_ROW_COUNT;
  }
}

// ─── Helper to determine if result is an error ───────────────────────────────

export function isUploadValidationError(
  result: UploadInitiationResult | UploadValidationError
): result is UploadValidationError {
  return 'code' in result && 'message' in result && 'details' in result;
}

// Export singleton instance
export const uploadService = new UploadService();
