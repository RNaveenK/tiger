import { describe, it, expect } from 'vitest';
import {
  CsvParserService,
  validateRow,
  roundHalfUp,
  getCurrencyMinorUnits,
  REQUIRED_COLUMNS,
} from '../../src/services/csv-parser.service.js';

describe('CsvParserService', () => {
  const service = new CsvParserService();

  function buildCsv(headers: string[], rows: string[][]): string {
    const headerLine = headers.join(',');
    const dataLines = rows.map((r) => r.join(','));
    return [headerLine, ...dataLines].join('\n');
  }

  describe('header validation', () => {
    it('should accept CSV with all required columns', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '9.99', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.columnValidation.valid).toBe(true);
      expect(result.columnValidation.missingColumns).toEqual([]);
    });

    it('should report missing columns when header is incomplete', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU'],
        [['STORE-001', 'SKU-123']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.columnValidation.valid).toBe(false);
      expect(result.columnValidation.missingColumns).toContain('Product Name');
      expect(result.columnValidation.missingColumns).toContain('Price');
      expect(result.columnValidation.missingColumns).toContain('Date');
      expect(result.columnValidation.missingColumns).not.toContain('StoreID');
      expect(result.columnValidation.missingColumns).not.toContain('SKU');
    });

    it('should report all columns missing when header has none of the required columns', async () => {
      const csv = buildCsv(
        ['Column1', 'Column2'],
        [['val1', 'val2']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.columnValidation.valid).toBe(false);
      expect(result.columnValidation.missingColumns).toHaveLength(5);
      for (const col of REQUIRED_COLUMNS) {
        expect(result.columnValidation.missingColumns).toContain(col);
      }
    });

    it('should return empty records when headers are invalid', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU'],
        [['STORE-001', 'SKU-123']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(0);
      expect(result.rejectedRows).toHaveLength(0);
      expect(result.totalRows).toBe(0);
    });

    it('should accept columns with extra whitespace in header names', async () => {
      const csv = ' StoreID , SKU , Product Name , Price , Date \nSTORE-001,SKU-123,Widget,9.99,2024-01-15';
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.columnValidation.valid).toBe(true);
      expect(result.records).toHaveLength(1);
    });
  });

  describe('row validation', () => {
    it('should accept a valid row', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Premium Widget', '29.99', '2024-03-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(1);
      expect(result.rejectedRows).toHaveLength(0);
      expect(result.records[0]).toEqual({
        storeId: 'STORE-001',
        sku: 'SKU-123',
        productName: 'Premium Widget',
        price: 29.99,
        date: '2024-03-15',
      });
    });

    it('should reject row with empty StoreID', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['', 'SKU-123', 'Widget', '9.99', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(0);
      expect(result.rejectedRows).toHaveLength(1);
      expect(result.rejectedRows[0].row).toBe(1);
      expect(result.rejectedRows[0].reasons).toContain('StoreID is empty');
    });

    it('should reject row with empty SKU', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', '', 'Widget', '9.99', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(0);
      expect(result.rejectedRows).toHaveLength(1);
      expect(result.rejectedRows[0].reasons).toContain('SKU is empty');
    });

    it('should reject row with non-numeric Price', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', 'abc', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(0);
      expect(result.rejectedRows).toHaveLength(1);
      expect(result.rejectedRows[0].reasons).toContain('Price is not numeric');
    });

    it('should reject row with Price below minimum (0.01)', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '0.00', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(0);
      expect(result.rejectedRows).toHaveLength(1);
      expect(result.rejectedRows[0].reasons[0]).toContain('out of range');
    });

    it('should reject row with Price above maximum (999999.99)', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '1000000.00', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(0);
      expect(result.rejectedRows).toHaveLength(1);
      expect(result.rejectedRows[0].reasons[0]).toContain('out of range');
    });

    it('should accept Price at minimum boundary (0.01)', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '0.01', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(1);
      expect(result.records[0].price).toBe(0.01);
    });

    it('should accept Price at maximum boundary (999999.99)', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '999999.99', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(1);
      expect(result.records[0].price).toBe(999999.99);
    });

    it('should reject row with invalid Date format', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '9.99', '01/15/2024']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(0);
      expect(result.rejectedRows).toHaveLength(1);
      expect(result.rejectedRows[0].reasons).toContain('Date is not in YYYY-MM-DD format');
    });

    it('should reject row with invalid Date format (missing dashes)', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '9.99', '20240115']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.rejectedRows).toHaveLength(1);
      expect(result.rejectedRows[0].reasons).toContain('Date is not in YYYY-MM-DD format');
    });

    it('should collect multiple rejection reasons for a single row', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['', '', 'Widget', 'abc', 'bad-date']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.rejectedRows).toHaveLength(1);
      const reasons = result.rejectedRows[0].reasons;
      expect(reasons).toContain('StoreID is empty');
      expect(reasons).toContain('SKU is empty');
      expect(reasons).toContain('Price is not numeric');
      expect(reasons).toContain('Date is not in YYYY-MM-DD format');
    });

    it('should track correct row numbers for rejections', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [
          ['STORE-001', 'SKU-123', 'Widget A', '9.99', '2024-01-15'],
          ['', 'SKU-456', 'Widget B', '19.99', '2024-01-16'],
          ['STORE-001', 'SKU-789', 'Widget C', '29.99', '2024-01-17'],
          ['STORE-002', '', 'Widget D', '39.99', '2024-01-18'],
        ]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records).toHaveLength(2);
      expect(result.rejectedRows).toHaveLength(2);
      expect(result.rejectedRows[0].row).toBe(2);
      expect(result.rejectedRows[1].row).toBe(4);
    });
  });

  describe('price rounding', () => {
    it('should round price to 2 decimal places for USD (half-up)', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '10.125', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records[0].price).toBe(10.13);
    });

    it('should round down when below half (half-up)', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '10.124', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records[0].price).toBe(10.12);
    });

    it('should round to 0 decimal places for JPY', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '1234.5', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'JPY' });

      expect(result.records[0].price).toBe(1235);
    });

    it('should round to 3 decimal places for KWD', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '10.1235', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'KWD' });

      expect(result.records[0].price).toBe(10.124);
    });

    it('should not modify prices already at correct precision', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '25.50', '2024-01-15']]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.records[0].price).toBe(25.5);
    });
  });

  describe('totalRows tracking', () => {
    it('should count total data rows processed', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [
          ['STORE-001', 'SKU-123', 'Widget A', '9.99', '2024-01-15'],
          ['STORE-001', 'SKU-456', 'Widget B', '19.99', '2024-01-16'],
          ['STORE-001', 'SKU-789', 'Widget C', '29.99', '2024-01-17'],
        ]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.totalRows).toBe(3);
    });

    it('should include both valid and rejected rows in totalRows', async () => {
      const csv = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [
          ['STORE-001', 'SKU-123', 'Widget A', '9.99', '2024-01-15'],
          ['', 'SKU-456', 'Widget B', 'bad', '2024-01-16'],
          ['STORE-001', 'SKU-789', 'Widget C', '29.99', '2024-01-17'],
        ]
      );
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.totalRows).toBe(3);
      expect(result.records).toHaveLength(2);
      expect(result.rejectedRows).toHaveLength(1);
    });

    it('should return 0 totalRows for empty CSV with only headers', async () => {
      const csv = 'StoreID,SKU,Product Name,Price,Date\n';
      const result = await service.parse(csv, { currency: 'USD' });

      expect(result.totalRows).toBe(0);
      expect(result.records).toHaveLength(0);
      expect(result.rejectedRows).toHaveLength(0);
    });
  });

  describe('Buffer and stream input', () => {
    it('should accept Buffer input', async () => {
      const csvStr = buildCsv(
        ['StoreID', 'SKU', 'Product Name', 'Price', 'Date'],
        [['STORE-001', 'SKU-123', 'Widget', '9.99', '2024-01-15']]
      );
      const buffer = Buffer.from(csvStr, 'utf-8');
      const result = await service.parse(buffer, { currency: 'USD' });

      expect(result.records).toHaveLength(1);
      expect(result.records[0].storeId).toBe('STORE-001');
    });
  });
});

describe('validateRow', () => {
  it('should return empty array for valid row', () => {
    const row = { StoreID: 'STORE-001', SKU: 'SKU-123', 'Product Name': 'Widget', Price: '9.99', Date: '2024-01-15' };
    expect(validateRow(row)).toEqual([]);
  });

  it('should detect empty StoreID', () => {
    const row = { StoreID: '', SKU: 'SKU-123', 'Product Name': 'Widget', Price: '9.99', Date: '2024-01-15' };
    expect(validateRow(row)).toContain('StoreID is empty');
  });

  it('should detect whitespace-only StoreID as empty', () => {
    const row = { StoreID: '   ', SKU: 'SKU-123', 'Product Name': 'Widget', Price: '9.99', Date: '2024-01-15' };
    expect(validateRow(row)).toContain('StoreID is empty');
  });

  it('should detect empty SKU', () => {
    const row = { StoreID: 'STORE-001', SKU: '', 'Product Name': 'Widget', Price: '9.99', Date: '2024-01-15' };
    expect(validateRow(row)).toContain('SKU is empty');
  });

  it('should detect non-numeric Price', () => {
    const row = { StoreID: 'STORE-001', SKU: 'SKU-123', 'Product Name': 'Widget', Price: 'free', Date: '2024-01-15' };
    expect(validateRow(row)).toContain('Price is not numeric');
  });

  it('should detect empty Price as non-numeric', () => {
    const row = { StoreID: 'STORE-001', SKU: 'SKU-123', 'Product Name': 'Widget', Price: '', Date: '2024-01-15' };
    expect(validateRow(row)).toContain('Price is not numeric');
  });

  it('should detect negative price as out of range', () => {
    const row = { StoreID: 'STORE-001', SKU: 'SKU-123', 'Product Name': 'Widget', Price: '-5.00', Date: '2024-01-15' };
    const reasons = validateRow(row);
    expect(reasons[0]).toContain('out of range');
  });

  it('should detect invalid date format', () => {
    const row = { StoreID: 'STORE-001', SKU: 'SKU-123', 'Product Name': 'Widget', Price: '9.99', Date: '2024/01/15' };
    expect(validateRow(row)).toContain('Date is not in YYYY-MM-DD format');
  });
});

describe('roundHalfUp', () => {
  it('should round 10.125 to 10.13 at 2 decimal places', () => {
    expect(roundHalfUp(10.125, 2)).toBe(10.13);
  });

  it('should round 10.124 to 10.12 at 2 decimal places', () => {
    expect(roundHalfUp(10.124, 2)).toBe(10.12);
  });

  it('should round 10.5 to 11 at 0 decimal places', () => {
    expect(roundHalfUp(10.5, 0)).toBe(11);
  });

  it('should round 10.4 to 10 at 0 decimal places', () => {
    expect(roundHalfUp(10.4, 0)).toBe(10);
  });

  it('should round 1.2345 to 1.235 at 3 decimal places', () => {
    expect(roundHalfUp(1.2345, 3)).toBe(1.235);
  });

  it('should not change value already at correct precision', () => {
    expect(roundHalfUp(10.12, 2)).toBe(10.12);
  });
});

describe('getCurrencyMinorUnits', () => {
  it('should return 2 for USD', () => {
    expect(getCurrencyMinorUnits('USD')).toBe(2);
  });

  it('should return 0 for JPY', () => {
    expect(getCurrencyMinorUnits('JPY')).toBe(0);
  });

  it('should return 3 for KWD', () => {
    expect(getCurrencyMinorUnits('KWD')).toBe(3);
  });

  it('should default to 2 for unknown currencies', () => {
    expect(getCurrencyMinorUnits('EUR')).toBe(2);
  });
});
