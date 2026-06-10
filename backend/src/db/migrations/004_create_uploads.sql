-- Migration: 004_create_uploads
-- Creates the uploads and upload_rejections tables for tracking CSV upload processing
-- Requirements: 1.1, 1.4, 1.6

CREATE TABLE uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name       VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    total_rows      INTEGER,
    valid_records   INTEGER,
    rejected_rows   INTEGER,
    updated_records INTEGER,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'queued')),
    currency        CHAR(3) NOT NULL,
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE upload_rejections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id   UUID NOT NULL REFERENCES uploads(id),
    row_number  INTEGER NOT NULL,
    reasons     TEXT[] NOT NULL
);
