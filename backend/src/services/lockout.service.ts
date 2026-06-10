/**
 * Account Lockout Service
 *
 * Tracks consecutive failed login attempts per user and locks accounts
 * after 5 consecutive failures within a 30-minute window.
 * Lockout duration: 15 minutes.
 *
 * Requirements: 4.7, 9.5, 9.6, 9.7
 */

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const FAILURE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FailedAttempt {
  timestamp: number; // Unix timestamp in ms
}

export interface LockoutRecord {
  failedAttempts: FailedAttempt[];
  lockedAt: number | null; // Unix timestamp in ms when locked, or null
}

export interface LockoutInfo {
  isLocked: boolean;
  failedAttemptCount: number;
  lockedAt: number | null;
  lockoutExpiresAt: number | null;
  remainingLockoutMs: number | null;
}

export interface LockoutEvent {
  userId: string;
  eventType: 'account_locked' | 'failed_attempt' | 'lockout_expired';
  timestamp: number;
  failedAttemptCount: number;
}

export type AdminNotifier = (event: LockoutEvent) => void;

// ─── LockoutService ──────────────────────────────────────────────────────────

export class LockoutService {
  /**
   * In-memory store for lockout records. In production, this would be backed by Redis.
   */
  private records = new Map<string, LockoutRecord>();

  /**
   * Logged lockout events (for auditing and admin notification).
   */
  private lockoutEvents: LockoutEvent[] = [];

  /**
   * Optional admin notification callback. Called within 60 seconds of lockout.
   */
  private adminNotifier: AdminNotifier | null = null;

  /**
   * Function to get current time (injectable for testing).
   */
  private now: () => number;

  constructor(options?: { now?: () => number; adminNotifier?: AdminNotifier }) {
    this.now = options?.now ?? (() => Date.now());
    this.adminNotifier = options?.adminNotifier ?? null;
  }

  /**
   * Set the admin notifier callback.
   */
  setAdminNotifier(notifier: AdminNotifier): void {
    this.adminNotifier = notifier;
  }

  /**
   * Record a failed login attempt for a user.
   * Returns the updated lockout info.
   *
   * If this attempt causes a lockout, logs the event and notifies admin.
   */
  recordFailedAttempt(userId: string): LockoutInfo {
    const currentTime = this.now();
    let record = this.getOrCreateRecord(userId);

    // If account is currently locked (and lock hasn't expired), just return locked info
    if (this.isLockedInternal(record, currentTime)) {
      return this.buildLockoutInfo(record, currentTime);
    }

    // If lockout has expired, reset the record
    if (record.lockedAt !== null && !this.isLockedInternal(record, currentTime)) {
      record = this.resetRecord(userId);
    }

    // Add the failed attempt
    record.failedAttempts.push({ timestamp: currentTime });

    // Prune attempts outside the 30-minute window
    record.failedAttempts = record.failedAttempts.filter(
      (attempt) => currentTime - attempt.timestamp <= FAILURE_WINDOW_MS
    );

    // Check if we've reached the lockout threshold
    if (record.failedAttempts.length >= MAX_FAILED_ATTEMPTS) {
      record.lockedAt = currentTime;

      // Log the lockout event
      const event: LockoutEvent = {
        userId,
        eventType: 'account_locked',
        timestamp: currentTime,
        failedAttemptCount: record.failedAttempts.length,
      };
      this.lockoutEvents.push(event);

      // Notify admin within 60 seconds (immediate callback for now)
      if (this.adminNotifier) {
        this.adminNotifier(event);
      }
    }

    this.records.set(userId, record);
    return this.buildLockoutInfo(record, currentTime);
  }

  /**
   * Record a successful login for a user.
   * Resets the failed attempt counter.
   */
  recordSuccessfulLogin(userId: string): void {
    this.resetRecord(userId);
  }

  /**
   * Check if a user account is currently locked.
   */
  isAccountLocked(userId: string): boolean {
    const record = this.records.get(userId);
    if (!record) {
      return false;
    }

    const currentTime = this.now();

    if (this.isLockedInternal(record, currentTime)) {
      return true;
    }

    // Lockout has expired - reset the record
    if (record.lockedAt !== null) {
      this.resetRecord(userId);
    }

    return false;
  }

  /**
   * Get detailed lockout information for a user.
   */
  getLockoutInfo(userId: string): LockoutInfo {
    const currentTime = this.now();
    const record = this.records.get(userId);

    if (!record) {
      return {
        isLocked: false,
        failedAttemptCount: 0,
        lockedAt: null,
        lockoutExpiresAt: null,
        remainingLockoutMs: null,
      };
    }

    // If lockout expired, reset and return clean state
    if (record.lockedAt !== null && !this.isLockedInternal(record, currentTime)) {
      this.resetRecord(userId);
      return {
        isLocked: false,
        failedAttemptCount: 0,
        lockedAt: null,
        lockoutExpiresAt: null,
        remainingLockoutMs: null,
      };
    }

    return this.buildLockoutInfo(record, currentTime);
  }

  /**
   * Get all logged lockout events.
   */
  getLockoutEvents(): LockoutEvent[] {
    return [...this.lockoutEvents];
  }

  /**
   * Clear all records (for testing purposes).
   */
  clear(): void {
    this.records.clear();
    this.lockoutEvents = [];
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private getOrCreateRecord(userId: string): LockoutRecord {
    const existing = this.records.get(userId);
    if (existing) {
      return existing;
    }
    const record: LockoutRecord = {
      failedAttempts: [],
      lockedAt: null,
    };
    this.records.set(userId, record);
    return record;
  }

  private resetRecord(userId: string): LockoutRecord {
    const record: LockoutRecord = {
      failedAttempts: [],
      lockedAt: null,
    };
    this.records.set(userId, record);
    return record;
  }

  private isLockedInternal(record: LockoutRecord, currentTime: number): boolean {
    if (record.lockedAt === null) {
      return false;
    }
    const elapsed = currentTime - record.lockedAt;
    return elapsed < LOCKOUT_DURATION_MS;
  }

  private buildLockoutInfo(record: LockoutRecord, currentTime: number): LockoutInfo {
    const isLocked = this.isLockedInternal(record, currentTime);

    // Filter attempts within window for count
    const recentAttempts = record.failedAttempts.filter(
      (attempt) => currentTime - attempt.timestamp <= FAILURE_WINDOW_MS
    );

    if (isLocked && record.lockedAt !== null) {
      const lockoutExpiresAt = record.lockedAt + LOCKOUT_DURATION_MS;
      const remainingLockoutMs = Math.max(0, lockoutExpiresAt - currentTime);

      return {
        isLocked: true,
        failedAttemptCount: recentAttempts.length,
        lockedAt: record.lockedAt,
        lockoutExpiresAt,
        remainingLockoutMs,
      };
    }

    return {
      isLocked: false,
      failedAttemptCount: recentAttempts.length,
      lockedAt: null,
      lockoutExpiresAt: null,
      remainingLockoutMs: null,
    };
  }
}

// ─── Constants (exported for testing) ────────────────────────────────────────

export const LOCKOUT_CONSTANTS = {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  FAILURE_WINDOW_MS,
} as const;

// Export singleton instance
export const lockoutService = new LockoutService();
