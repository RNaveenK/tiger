import { Readable } from 'stream';
import { parse } from 'csv-parse';

// ─── Constants ───────────────────────────────────────────────────────────────

export const REQUIRED_COLUMNS = ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'] as const;

const MIN_PRICE = 0.01;
const MAX_PRICE = 999999.99;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CsvParseOptions {
  /** ISO 4217 currency code, used to determine minor unit precision for rounding */
  currency: string;
}

export interface ParsedRecord {
  storeId: string;
  sku: string;
  productName: string;
  price: number;
  date: string;
}

export interface RejectedRow {
  row: number;
  reasons: string[];
}

export interface ColumnValidationResult {
  valid: boolean;
  missingColumns: string[];
}

export interface CsvParseResult {
  records: ParsedRecord[];
  rejectedRows: RejectedRow[];
  columnValidation: ColumnValidationResult;
  totalRows: number;
}

// ─── Currency Minor Units ────────────────────────────────────────────────────

/**
 * Map of ISO 4217 currency codes to their minor unit (decimal places).
 * Most currencies use 2 decimal places. Notable exceptions listed here.
 */
const CURRENCY_MINOR_UNITS: Record<string, number> = {
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0,
  KRW: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0,
  XOF: 0, XPF: 0,
};

/**
 * Get the number of minor unit decimal places for a given currency.
 * Defaults to 2 if the currency is not in the known exceptions list.
 */
export function getCurrencyMinorUnits(currency: string): number {
  return CURRENCY_MINOR_UNITS[currency] ?? 2;
}

// ─── Rounding ────────────────────────────────────────────────────────────────

/**
 * Round a number to the specified number of decimal places using half-up rounding.
 * Half-up: 10.125 → 10.13, 10.124 → 10.12 (for 2 decimals)
 */
export function roundHalfUp(value: number, decimalPlaces: number): number {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(value * factor + Number.EPSILON) / factor;
}

// ─── Row Validation ──────────────────────────────────────────────────────────

/**
 * Validate a single CSV row and return an array of reason strings for failures.
 * Returns an empty array if the row is valid.
 */
export function validateRow(row: Record<string, string>): string[] {
  const reasons: string[] = [];

  // StoreID must be non-empty
  const storeId = (row['StoreID'] ?? '').trim();
  if (storeId === '') {
    reasons.push('StoreID is empty');
  }

  // SKU must be non-empty
  const sku = (row['SKU'] ?? '').trim();
  if (sku === '') {
    reasons.push('SKU is empty');
  }

  // Price must be numeric and within range
  const priceStr = (row['Price'] ?? '').trim();
  if (priceStr === '') {
    reasons.push('Price is not numeric');
  } else {
    const price = Number(priceStr);
    if (isNaN(price)) {
      reasons.push('Price is not numeric');
    } else if (price < MIN_PRICE || price > MAX_PRICE) {
      reasons.push(`Price is out of range (must be between ${MIN_PRICE} and ${MAX_PRICE})`);
    }
  }

  // Date must match YYYY-MM-DD format
  const dateStr = (row['Date'] ?? '').trim();
  if (!DATE_REGEX.test(dateStr)) {
    reasons.push('Date is not in YYYY-MM-DD format');
  }

  return reasons;
}

// ─── CSV Parser Service ──────────────────────────────────────────────────────

export class CsvParserService {
  /**
   * Parse CSV data from a readable stream or Buffer.
   * Validates headers, validates each row, applies price rounding,
   * and collects valid records and rejected rows.
   */
  async parse(input: Readable | Buffer | string, options: CsvParseOptions): Promise<CsvParseResult> {
    const records: ParsedRecord[] = [];
    const rejectedRows: RejectedRow[] = [];
    const minorUnits = getCurrencyMinorUnits(options.currency);

    // Convert Buffer or string to a Readable stream
    const stream = this.toReadable(input);

    // Create streaming CSV parser with headers
    const parser = stream.pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      })
    );

    // We need to validate headers after the parser emits the first record or columns event
    let columnValidation: ColumnValidationResult | null = null;
    let headerChecked = false;
    let rowNumber = 0;

    return new Promise<CsvParseResult>((resolve, reject) => {
      parser.on('readable', () => {
        let row: Record<string, string> | null;
        while ((row = parser.read()) !== null) {
          // On first row, validate headers
          if (!headerChecked) {
            headerChecked = true;
            const columns = Object.keys(row);
            columnValidation = this.validateColumns(columns);

            if (!columnValidation.valid) {
              // Stop processing: headers are invalid
              parser.destroy();
              resolve({
                records: [],
                rejectedRows: [],
                columnValidation,
                totalRows: 0,
              });
              return;
            }
          }

          rowNumber++;

          // Validate the row
          const reasons = validateRow(row);
          if (reasons.length > 0) {
            rejectedRows.push({ row: rowNumber, reasons });
          } else {
            // Parse and round price
            const rawPrice = Number(row['Price'].trim());
            const roundedPrice = roundHalfUp(rawPrice, minorUnits);

            records.push({
              storeId: row['StoreID'].trim(),
              sku: row['SKU'].trim(),
              productName: (row['Product Name'] ?? '').trim(),
              price: roundedPrice,
              date: row['Date'].trim(),
            });
          }
        }
      });

      parser.on('error', (err) => {
        reject(err);
      });

      parser.on('end', () => {
        // If no rows were read, headers may still need validation
        if (!headerChecked) {
          columnValidation = { valid: true, missingColumns: [] };
        }

        resolve({
          records,
          rejectedRows,
          columnValidation: columnValidation!,
          totalRows: rowNumber,
        });
      });
    });
  }

  /**
   * Validate that all required columns are present in the header row.
   */
  validateColumns(columns: string[]): ColumnValidationResult {
    const normalizedColumns = columns.map((c) => c.trim());
    const missingColumns: string[] = [];

    for (const required of REQUIRED_COLUMNS) {
      if (!normalizedColumns.includes(required)) {
        missingColumns.push(required);
      }
    }

    return {
      valid: missingColumns.length === 0,
      missingColumns,
    };
  }

  /**
   * Convert various input types to a Readable stream.
   */
  private toReadable(input: Readable | Buffer | string): Readable {
    if (input instanceof Readable) {
      return input;
    }
    const data = typeof input === 'string' ? input : input.toString('utf-8');
    return Readable.from([data]);
  }
}

// Export singleton instance
export const csvParserService = new CsvParserService();
