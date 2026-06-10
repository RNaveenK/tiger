import { describe, it, expect, beforeEach } from 'vitest';
import {
  UploadService,
  isUploadValidationError,
  UploadInitiationRequest,
} from '../../src/services/upload.service.js';
import { UploadStatus } from '../../src/types/index.js';

describe('UploadService', () => {
  let uploadService: UploadService;

  beforeEach(() => {
    uploadService = new UploadService();
    uploadService.clearUploads();
  });

  function createValidRequest(overrides: Partial<UploadInitiationRequest> = {}): UploadInitiationRequest {
    return {
      file: {
        fileName: 'pricing-data.csv',
        fileSizeBytes: 1024 * 1024, // 1 MB
        rowCount: 1000,
      },
      currency: 'USD',
      uploadedBy: 'user-123',
      ...overrides,
    };
  }

  describe('initiateUpload', () => {
    it('should successfully initiate upload with valid request', () => {
      const request = createValidRequest();
      const result = uploadService.initiateUpload(request);

      expect(isUploadValidationError(result)).toBe(false);
      if (!isUploadValidationError(result)) {
        expect(result.uploadId).toBeDefined();
        expect(result.uploadId.length).toBeGreaterThan(0);
        expect(result.status).toBe(UploadStatus.Processing);
      }
    });

    it('should create a tracking record in the store', () => {
      const request = createValidRequest();
      const result = uploadService.initiateUpload(request);

      if (!isUploadValidationError(result)) {
        const upload = uploadService.getUpload(result.uploadId);
        expect(upload).not.toBeNull();
        expect(upload!.fileName).toBe('pricing-data.csv');
        expect(upload!.fileSizeBytes).toBe(1024 * 1024);
        expect(upload!.totalRows).toBe(1000);
        expect(upload!.currency).toBe('USD');
        expect(upload!.uploadedBy).toBe('user-123');
        expect(upload!.status).toBe(UploadStatus.Processing);
        expect(upload!.startedAt).not.toBeNull();
        expect(upload!.completedAt).toBeNull();
        expect(upload!.errorMessage).toBeNull();
      }
    });

    it('should generate unique upload IDs for each request', () => {
      const request = createValidRequest();
      const result1 = uploadService.initiateUpload(request);
      const result2 = uploadService.initiateUpload(request);

      if (!isUploadValidationError(result1) && !isUploadValidationError(result2)) {
        expect(result1.uploadId).not.toBe(result2.uploadId);
      }
    });
  });

  describe('file size validation', () => {
    it('should reject file exceeding 50 MB with FILE_TOO_LARGE error', () => {
      const request = createValidRequest({
        file: {
          fileName: 'large-file.csv',
          fileSizeBytes: 52_428_801, // 50 MB + 1 byte
          rowCount: 1000,
        },
      });

      const result = uploadService.initiateUpload(request);

      expect(isUploadValidationError(result)).toBe(true);
      if (isUploadValidationError(result)) {
        expect(result.code).toBe('FILE_TOO_LARGE');
        expect(result.message).toContain('50 MB');
        expect(result.details).toHaveLength(1);
        expect(result.details[0].field).toBe('file');
      }
    });

    it('should accept file at exactly 50 MB', () => {
      const request = createValidRequest({
        file: {
          fileName: 'exact-50mb.csv',
          fileSizeBytes: 52_428_800, // exactly 50 MB
          rowCount: 1000,
        },
      });

      const result = uploadService.initiateUpload(request);
      expect(isUploadValidationError(result)).toBe(false);
    });

    it('should accept small files', () => {
      const request = createValidRequest({
        file: {
          fileName: 'small.csv',
          fileSizeBytes: 100,
          rowCount: 5,
        },
      });

      const result = uploadService.initiateUpload(request);
      expect(isUploadValidationError(result)).toBe(false);
    });
  });

  describe('row count validation', () => {
    it('should reject file exceeding 200,000 rows with ROW_LIMIT_EXCEEDED error', () => {
      const request = createValidRequest({
        file: {
          fileName: 'too-many-rows.csv',
          fileSizeBytes: 1024,
          rowCount: 200_001,
        },
      });

      const result = uploadService.initiateUpload(request);

      expect(isUploadValidationError(result)).toBe(true);
      if (isUploadValidationError(result)) {
        expect(result.code).toBe('ROW_LIMIT_EXCEEDED');
        expect(result.message).toContain('200,000');
        expect(result.details).toHaveLength(1);
        expect(result.details[0].field).toBe('file');
      }
    });

    it('should accept file at exactly 200,000 rows', () => {
      const request = createValidRequest({
        file: {
          fileName: 'max-rows.csv',
          fileSizeBytes: 1024,
          rowCount: 200_000,
        },
      });

      const result = uploadService.initiateUpload(request);
      expect(isUploadValidationError(result)).toBe(false);
    });

    it('should accept upload when rowCount is not provided', () => {
      const request: UploadInitiationRequest = {
        file: {
          fileName: 'no-row-count.csv',
          fileSizeBytes: 1024,
        },
        currency: 'EUR',
        uploadedBy: 'user-456',
      };

      const result = uploadService.initiateUpload(request);
      expect(isUploadValidationError(result)).toBe(false);
    });
  });

  describe('currency code validation', () => {
    it('should reject invalid currency code', () => {
      const request = createValidRequest({ currency: 'XYZ' });
      const result = uploadService.initiateUpload(request);

      expect(isUploadValidationError(result)).toBe(true);
      if (isUploadValidationError(result)) {
        expect(result.code).toBe('INVALID_CURRENCY');
        expect(result.message).toContain('XYZ');
        expect(result.details).toHaveLength(1);
        expect(result.details[0].field).toBe('currency');
        expect(result.details[0].issue).toContain('XYZ');
      }
    });

    it('should reject lowercase currency code', () => {
      const request = createValidRequest({ currency: 'usd' });
      const result = uploadService.initiateUpload(request);

      expect(isUploadValidationError(result)).toBe(true);
      if (isUploadValidationError(result)) {
        expect(result.code).toBe('INVALID_CURRENCY');
      }
    });

    it('should reject empty currency code', () => {
      const request = createValidRequest({ currency: '' });
      const result = uploadService.initiateUpload(request);

      expect(isUploadValidationError(result)).toBe(true);
      if (isUploadValidationError(result)) {
        expect(result.code).toBe('INVALID_CURRENCY');
      }
    });

    it('should accept valid ISO 4217 currency codes', () => {
      const validCodes = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR'];
      for (const currency of validCodes) {
        const request = createValidRequest({ currency });
        const result = uploadService.initiateUpload(request);
        expect(isUploadValidationError(result)).toBe(false);
      }
    });

    it('should reject non-alphabetic strings', () => {
      const invalidCodes = ['123', 'U$D', 'US1', 'AB'];
      for (const currency of invalidCodes) {
        const request = createValidRequest({ currency });
        const result = uploadService.initiateUpload(request);
        expect(isUploadValidationError(result)).toBe(true);
      }
    });
  });

  describe('validation priority', () => {
    it('should check file size before row count', () => {
      const request = createValidRequest({
        file: {
          fileName: 'both-invalid.csv',
          fileSizeBytes: 52_428_801, // too large
          rowCount: 200_001, // too many rows
        },
      });

      const result = uploadService.initiateUpload(request);

      expect(isUploadValidationError(result)).toBe(true);
      if (isUploadValidationError(result)) {
        expect(result.code).toBe('FILE_TOO_LARGE');
      }
    });

    it('should check row count before currency', () => {
      const request = createValidRequest({
        file: {
          fileName: 'rows-and-currency-invalid.csv',
          fileSizeBytes: 1024,
          rowCount: 200_001,
        },
        currency: 'INVALID',
      });

      const result = uploadService.initiateUpload(request);

      expect(isUploadValidationError(result)).toBe(true);
      if (isUploadValidationError(result)) {
        expect(result.code).toBe('ROW_LIMIT_EXCEEDED');
      }
    });
  });

  describe('getUpload', () => {
    it('should return null for non-existent upload', () => {
      const upload = uploadService.getUpload('non-existent-id');
      expect(upload).toBeNull();
    });

    it('should return the upload record after initiation', () => {
      const request = createValidRequest();
      const result = uploadService.initiateUpload(request);

      if (!isUploadValidationError(result)) {
        const upload = uploadService.getUpload(result.uploadId);
        expect(upload).not.toBeNull();
        expect(upload!.id).toBe(result.uploadId);
      }
    });
  });

  describe('updateUploadStatus', () => {
    it('should update upload status to completed', () => {
      const request = createValidRequest();
      const result = uploadService.initiateUpload(request);

      if (!isUploadValidationError(result)) {
        const updated = uploadService.updateUploadStatus(result.uploadId, UploadStatus.Completed);
        expect(updated).toBe(true);

        const upload = uploadService.getUpload(result.uploadId);
        expect(upload!.status).toBe(UploadStatus.Completed);
        expect(upload!.completedAt).not.toBeNull();
      }
    });

    it('should update upload status to failed with error message', () => {
      const request = createValidRequest();
      const result = uploadService.initiateUpload(request);

      if (!isUploadValidationError(result)) {
        const updated = uploadService.updateUploadStatus(
          result.uploadId,
          UploadStatus.Failed,
          'Database connection lost'
        );
        expect(updated).toBe(true);

        const upload = uploadService.getUpload(result.uploadId);
        expect(upload!.status).toBe(UploadStatus.Failed);
        expect(upload!.errorMessage).toBe('Database connection lost');
        expect(upload!.completedAt).not.toBeNull();
      }
    });

    it('should return false for non-existent upload', () => {
      const updated = uploadService.updateUploadStatus('non-existent', UploadStatus.Completed);
      expect(updated).toBe(false);
    });
  });

  describe('isUploadValidationError', () => {
    it('should return true for validation errors', () => {
      const error = {
        code: 'FILE_TOO_LARGE',
        message: 'File too large',
        details: [{ field: 'file', issue: 'too large' }],
      };
      expect(isUploadValidationError(error)).toBe(true);
    });

    it('should return false for successful results', () => {
      const success = {
        uploadId: 'some-id',
        status: UploadStatus.Processing,
      };
      expect(isUploadValidationError(success)).toBe(false);
    });
  });
});
