-- Migration: 002_create_pricing_records
-- Creates the pricing_records table with composite unique constraint, price check, currency check
-- Enables pg_trgm extension and creates trigram GIN index on product_name
-- Creates composite indexes for search performance
-- Requirements: 5.1, 5.5, 2.2, 2.5

-- Enable pg_trgm extension for trigram-based substring search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE pricing_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        VARCHAR(50) NOT NULL,
    sku             VARCHAR(100) NOT NULL,
    product_name    VARCHAR(500) NOT NULL,
    price           DECIMAL(12, 4) NOT NULL,  -- stored with extra precision, displayed per currency
    currency        CHAR(3) NOT NULL,         -- ISO 4217
    record_date     DATE NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID NOT NULL REFERENCES users(id),
    updated_by      UUID NOT NULL REFERENCES users(id),

    CONSTRAINT uq_store_sku_date UNIQUE (store_id, sku, record_date),
    CONSTRAINT chk_price_range CHECK (price >= 0.01 AND price <= 999999999.99),
    CONSTRAINT chk_currency_code CHECK (currency ~ '^[A-Z]{3}$')
);

-- Performance indexes
CREATE INDEX idx_pricing_store_id ON pricing_records (store_id);
CREATE INDEX idx_pricing_sku ON pricing_records (sku);
CREATE INDEX idx_pricing_date ON pricing_records (record_date DESC);
CREATE INDEX idx_pricing_product_name_trgm ON pricing_records USING gin (product_name gin_trgm_ops);
CREATE INDEX idx_pricing_composite ON pricing_records (store_id, sku, record_date DESC);
