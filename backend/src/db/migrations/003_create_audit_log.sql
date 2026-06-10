-- Migration: 003_create_audit_log
-- Creates the audit_log table with indexes for record lookups and time-based queries
-- Requirements: 3.5

CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id       UUID NOT NULL REFERENCES pricing_records(id),
    field_name      VARCHAR(50) NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    changed_by      UUID NOT NULL REFERENCES users(id),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action          VARCHAR(20) NOT NULL  -- 'update', 'upsert_upload'
);

CREATE INDEX idx_audit_record_id ON audit_log (record_id);
CREATE INDEX idx_audit_changed_at ON audit_log (changed_at DESC);
