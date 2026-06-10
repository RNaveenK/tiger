import { SecurityAuditLogEntry } from '../types/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ActionType = 'login' | 'logout' | 'upload' | 'search' | 'edit' | 'lockout';

export type Outcome = 'success' | 'failure';

export interface SecurityAuditInput {
  userId: string | null;
  actionType: ActionType;
  resourceType?: string | null;
  resourceId?: string | null;
  outcome: Outcome;
  ipAddress?: string | null;
  details?: Record<string, unknown> | null;
}

// ─── In-Memory Store ─────────────────────────────────────────────────────────

/**
 * In-memory audit log store. In production, this will be backed by PostgreSQL
 * (security_audit_log table from migration 005).
 */
const auditLog: SecurityAuditLogEntry[] = [];

// ─── SecurityAuditService ────────────────────────────────────────────────────

export class SecurityAuditService {
  /**
   * Log a security-relevant user action.
   *
   * Persists an entry matching the security_audit_log schema:
   * - id: auto-generated UUID
   * - userId: the acting user (null for failed login attempts with unknown user)
   * - actionType: one of 'login', 'logout', 'upload', 'search', 'edit', 'lockout'
   * - resourceType: optional type of resource acted upon (e.g. 'pricing_record', 'upload')
   * - resourceId: optional identifier of the specific resource
   * - outcome: 'success' or 'failure'
   * - ipAddress: client IP address
   * - details: optional JSON object with additional context
   * - createdAt: ISO 8601 timestamp of when the action occurred
   */
  logAction(input: SecurityAuditInput): SecurityAuditLogEntry {
    const entry: SecurityAuditLogEntry = {
      id: generateUUID(),
      userId: input.userId,
      actionType: input.actionType,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      outcome: input.outcome,
      ipAddress: input.ipAddress ?? null,
      details: input.details ?? null,
      createdAt: new Date().toISOString(),
    };

    auditLog.push(entry);
    return entry;
  }

  /**
   * Retrieve all audit log entries (for querying/testing).
   */
  getAll(): SecurityAuditLogEntry[] {
    return [...auditLog];
  }

  /**
   * Query audit log entries by user ID.
   */
  getByUserId(userId: string): SecurityAuditLogEntry[] {
    return auditLog.filter((entry) => entry.userId === userId);
  }

  /**
   * Query audit log entries by action type.
   */
  getByActionType(actionType: ActionType): SecurityAuditLogEntry[] {
    return auditLog.filter((entry) => entry.actionType === actionType);
  }

  /**
   * Query audit log entries by outcome.
   */
  getByOutcome(outcome: Outcome): SecurityAuditLogEntry[] {
    return auditLog.filter((entry) => entry.outcome === outcome);
  }

  /**
   * Clear all entries (for testing purposes).
   */
  clear(): void {
    auditLog.length = 0;
  }

  /**
   * Get total count of audit log entries.
   */
  count(): number {
    return auditLog.length;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Export singleton instance
export const securityAuditService = new SecurityAuditService();
