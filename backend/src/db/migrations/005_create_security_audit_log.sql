-- Migration: 005_create_security_audit_log
-- Creates the security_audit_log table with indexes for user and action lookups
-- Requirements: 9.3

CREATE TABLE security_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    action_type     VARCHAR(50) NOT NULL,  -- 'login', 'logout', 'upload', 'search', 'edit', 'lockout'
    resource_type   VARCHAR(50),
    resource_id     VARCHAR(255),
    outcome         VARCHAR(10) NOT NULL CHECK (outcome IN ('success', 'failure')),
    ip_address      INET,
    details         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sec_audit_user ON security_audit_log (user_id, created_at DESC);
CREATE INDEX idx_sec_audit_action ON security_audit_log (action_type, created_at DESC);
