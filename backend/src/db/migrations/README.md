# Database Migrations

## Migration Files

Migrations are numbered and must be applied in order:

| # | File | Description |
|---|------|-------------|
| 001 | `001_create_users.sql` | Users table with role check constraint |
| 002 | `002_create_pricing_records.sql` | Pricing records with composite unique constraint, price/currency checks, pg_trgm extension, and performance indexes |
| 003 | `003_create_audit_log.sql` | Audit log for field-level change tracking with indexes |
| 004 | `004_create_uploads.sql` | Upload tracking and rejection details tables |
| 005 | `005_create_security_audit_log.sql` | Security audit log with user and action indexes |

## Applying Migrations

Run migrations against your PostgreSQL instance in numeric order:

```bash
psql -d your_database -f backend/src/db/migrations/001_create_users.sql
psql -d your_database -f backend/src/db/migrations/002_create_pricing_records.sql
psql -d your_database -f backend/src/db/migrations/003_create_audit_log.sql
psql -d your_database -f backend/src/db/migrations/004_create_uploads.sql
psql -d your_database -f backend/src/db/migrations/005_create_security_audit_log.sql
```

## Dependencies

- Migration 002 requires the `pg_trgm` extension (created via `CREATE EXTENSION IF NOT EXISTS pg_trgm`)
- Migration 002 references `users(id)` — requires migration 001
- Migration 003 references `pricing_records(id)` and `users(id)` — requires migrations 001, 002
- Migration 004 references `users(id)` — requires migration 001
- Migration 005 references `users(id)` — requires migration 001
