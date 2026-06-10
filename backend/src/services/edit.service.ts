import { EditRequest, ErrorDetail } from '../types/index.js';
import { isValidCurrencyCode } from '../utils/currency-codes.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const PRICE_MIN = 0.01;
const PRICE_MAX = 999_999_999.99;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EditValidationResult {
  valid: boolean;
  errors: ErrorDetail[];
}

// ─── EditService ─────────────────────────────────────────────────────────────

export class EditService {
  /**
   * Validate an edit request. Returns field-level validation errors if any
   * fields are invalid, or null if the request is valid.
   *
   * Validates:
   * - All required fields are non-empty (storeId, sku, productName, price, date)
   * - Price is numeric and within 0.01–999,999,999.99
   * - Date matches YYYY-MM-DD format and is a valid calendar date
   * - Currency code is a valid ISO 4217 three-letter code
   */
  validate(request: EditRequest): EditValidationResult {
    const errors: ErrorDetail[] = [];

    // Validate required fields are non-empty
    this.validateRequiredFields(request, errors);

    // Validate price range (only if price is present and numeric)
    this.validatePrice(request.price, errors);

    // Validate date format and validity
    this.validateDate(request.date, errors);

    // Validate currency code
    this.validateCurrency(request.currency, errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate that all required fields are non-empty.
   */
  private validateRequiredFields(request: EditRequest, errors: ErrorDetail[]): void {
    if (!request.storeId || request.storeId.trim() === '') {
      errors.push({ field: 'storeId', issue: 'StoreID is required and cannot be empty' });
    }

    if (!request.sku || request.sku.trim() === '') {
      errors.push({ field: 'sku', issue: 'SKU is required and cannot be empty' });
    }

    if (!request.productName || request.productName.trim() === '') {
      errors.push({ field: 'productName', issue: 'Product Name is required and cannot be empty' });
    }

    if (request.price === undefined || request.price === null) {
      errors.push({ field: 'price', issue: 'Price is required' });
    }

    if (!request.date || request.date.trim() === '') {
      errors.push({ field: 'date', issue: 'Date is required and cannot be empty' });
    }
  }

  /**
   * Validate price is numeric and within the allowed range (0.01–999,999,999.99).
   */
  private validatePrice(price: number | undefined | null, errors: ErrorDetail[]): void {
    if (price === undefined || price === null) {
      return; // Already handled by required field check
    }

    if (typeof price !== 'number' || isNaN(price)) {
      errors.push({ field: 'price', issue: 'Price must be a numeric value' });
      return;
    }

    if (price < PRICE_MIN || price > PRICE_MAX) {
      errors.push({
        field: 'price',
        issue: `Price must be between ${PRICE_MIN} and ${PRICE_MAX.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      });
    }
  }

  /**
   * Validate date matches YYYY-MM-DD format and is a valid calendar date.
   */
  private validateDate(date: string | undefined | null, errors: ErrorDetail[]): void {
    if (!date || date.trim() === '') {
      return; // Already handled by required field check
    }

    if (!DATE_REGEX.test(date)) {
      errors.push({ field: 'date', issue: 'Date must be in YYYY-MM-DD format' });
      return;
    }

    // Check if the date is a valid calendar date
    if (!this.isValidCalendarDate(date)) {
      errors.push({ field: 'date', issue: 'Date must be a valid calendar date' });
    }
  }

  /**
   * Validate currency code against ISO 4217 list.
   */
  private validateCurrency(currency: string | undefined | null, errors: ErrorDetail[]): void {
    if (!currency || currency.trim() === '') {
      errors.push({ field: 'currency', issue: 'Currency code is required and cannot be empty' });
      return;
    }

    if (!isValidCurrencyCode(currency)) {
      errors.push({
        field: 'currency',
        issue: `'${currency}' is not a valid ISO 4217 currency code`,
      });
    }
  }

  /**
   * Check if a YYYY-MM-DD string represents a valid calendar date.
   */
  private isValidCalendarDate(dateStr: string): boolean {
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // Month must be 1-12
    if (month < 1 || month > 12) {
      return false;
    }

    // Day must be valid for the given month/year
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export const editService = new EditService();
