import { describe, it, expect } from 'vitest';
import { EditService } from '../../src/services/edit.service.js';
import { EditRequest } from '../../src/types/index.js';

describe('EditService', () => {
  const editService = new EditService();

  function createValidRequest(overrides: Partial<EditRequest> = {}): EditRequest {
    return {
      storeId: 'STORE-001',
      sku: 'SKU-12345',
      productName: 'Premium Widget',
      price: 29.99,
      currency: 'USD',
      date: '2024-03-15',
      version: 1,
      ...overrides,
    };
  }

  describe('valid requests', () => {
    it('should return valid for a complete well-formed request', () => {
      const result = editService.validate(createValidRequest());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept price at minimum boundary (0.01)', () => {
      const result = editService.validate(createValidRequest({ price: 0.01 }));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept price at maximum boundary (999,999,999.99)', () => {
      const result = editService.validate(createValidRequest({ price: 999_999_999.99 }));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept leap year date (2024-02-29)', () => {
      const result = editService.validate(createValidRequest({ date: '2024-02-29' }));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept various valid currency codes', () => {
      const codes = ['USD', 'EUR', 'GBP', 'JPY', 'INR'];
      for (const currency of codes) {
        const result = editService.validate(createValidRequest({ currency }));
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('required field validation', () => {
    it('should return error when storeId is empty', () => {
      const result = editService.validate(createValidRequest({ storeId: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'storeId', issue: expect.stringContaining('required') })
      );
    });

    it('should return error when storeId is whitespace only', () => {
      const result = editService.validate(createValidRequest({ storeId: '   ' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'storeId' })
      );
    });

    it('should return error when sku is empty', () => {
      const result = editService.validate(createValidRequest({ sku: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'sku', issue: expect.stringContaining('required') })
      );
    });

    it('should return error when productName is empty', () => {
      const result = editService.validate(createValidRequest({ productName: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'productName', issue: expect.stringContaining('required') })
      );
    });

    it('should return error when date is empty', () => {
      const result = editService.validate(createValidRequest({ date: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'date', issue: expect.stringContaining('required') })
      );
    });

    it('should return multiple errors when multiple required fields are empty', () => {
      const result = editService.validate(
        createValidRequest({ storeId: '', sku: '', productName: '' })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('storeId');
      expect(fields).toContain('sku');
      expect(fields).toContain('productName');
    });
  });

  describe('price validation', () => {
    it('should return error when price is below minimum (0.01)', () => {
      const result = editService.validate(createValidRequest({ price: 0 }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'price', issue: expect.stringContaining('between') })
      );
    });

    it('should return error when price is negative', () => {
      const result = editService.validate(createValidRequest({ price: -5.00 }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'price' })
      );
    });

    it('should return error when price exceeds maximum (999,999,999.99)', () => {
      const result = editService.validate(createValidRequest({ price: 1_000_000_000 }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'price', issue: expect.stringContaining('between') })
      );
    });

    it('should return error when price is NaN', () => {
      const result = editService.validate(createValidRequest({ price: NaN }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'price', issue: expect.stringContaining('numeric') })
      );
    });

    it('should accept price with decimal values', () => {
      const result = editService.validate(createValidRequest({ price: 49.995 }));
      expect(result.valid).toBe(true);
    });
  });

  describe('date validation', () => {
    it('should return error for date in wrong format (DD/MM/YYYY)', () => {
      const result = editService.validate(createValidRequest({ date: '15/03/2024' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'date', issue: expect.stringContaining('YYYY-MM-DD') })
      );
    });

    it('should return error for date in wrong format (MM-DD-YYYY)', () => {
      const result = editService.validate(createValidRequest({ date: '03-15-2024' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'date', issue: expect.stringContaining('YYYY-MM-DD') })
      );
    });

    it('should return error for invalid month (13)', () => {
      const result = editService.validate(createValidRequest({ date: '2024-13-01' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'date', issue: expect.stringContaining('valid calendar date') })
      );
    });

    it('should return error for invalid day (32)', () => {
      const result = editService.validate(createValidRequest({ date: '2024-01-32' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'date', issue: expect.stringContaining('valid calendar date') })
      );
    });

    it('should return error for Feb 29 in non-leap year', () => {
      const result = editService.validate(createValidRequest({ date: '2023-02-29' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'date', issue: expect.stringContaining('valid calendar date') })
      );
    });

    it('should return error for non-date strings matching format', () => {
      const result = editService.validate(createValidRequest({ date: '2024-00-15' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'date' })
      );
    });

    it('should accept valid dates', () => {
      const validDates = ['2024-01-01', '2024-12-31', '2000-02-29', '1999-06-15'];
      for (const date of validDates) {
        const result = editService.validate(createValidRequest({ date }));
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('currency validation', () => {
    it('should return error for invalid currency code', () => {
      const result = editService.validate(createValidRequest({ currency: 'XYZ' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'currency', issue: expect.stringContaining('ISO 4217') })
      );
    });

    it('should return error for lowercase currency code', () => {
      const result = editService.validate(createValidRequest({ currency: 'usd' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'currency' })
      );
    });

    it('should return error for empty currency code', () => {
      const result = editService.validate(createValidRequest({ currency: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'currency', issue: expect.stringContaining('required') })
      );
    });

    it('should return error for numeric currency code', () => {
      const result = editService.validate(createValidRequest({ currency: '123' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'currency' })
      );
    });
  });

  describe('multiple errors', () => {
    it('should return all field-level errors at once', () => {
      const result = editService.validate({
        storeId: '',
        sku: '',
        productName: '',
        price: -1,
        currency: 'INVALID',
        date: 'bad-date',
        version: 1,
      });

      expect(result.valid).toBe(false);
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('storeId');
      expect(fields).toContain('sku');
      expect(fields).toContain('productName');
      expect(fields).toContain('price');
      expect(fields).toContain('currency');
      expect(fields).toContain('date');
    });

    it('should identify each failing field with specific reason', () => {
      const result = editService.validate({
        storeId: 'STORE-001',
        sku: '',
        productName: 'Widget',
        price: 0,
        currency: 'USD',
        date: '2024-02-30',
        version: 1,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3); // sku empty, price out of range, invalid date
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'sku' })
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'price' })
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'date' })
      );
    });
  });
});
