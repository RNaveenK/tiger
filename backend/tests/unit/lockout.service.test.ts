import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LockoutService, LOCKOUT_CONSTANTS, LockoutEvent } from '../../src/services/lockout.service.js';

const { MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MS, FAILURE_WINDOW_MS } = LOCKOUT_CONSTANTS;

describe('LockoutService', () => {
  let service: LockoutService;
  let currentTime: number;
  const userId = 'user-123';

  beforeEach(() => {
    currentTime = Date.now();
    service = new LockoutService({ now: () => currentTime });
  });

  describe('recordFailedAttempt', () => {
    it('should track a single failed attempt', () => {
      const info = service.recordFailedAttempt(userId);

      expect(info.isLocked).toBe(false);
      expect(info.failedAttemptCount).toBe(1);
      expect(info.lockedAt).toBeNull();
    });

    it('should track multiple failed attempts without locking below threshold', () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
        service.recordFailedAttempt(userId);
      }

      const info = service.getLockoutInfo(userId);
      expect(info.isLocked).toBe(false);
      expect(info.failedAttemptCount).toBe(MAX_FAILED_ATTEMPTS - 1);
    });

    it('should lock account after 5 consecutive failures', () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }

      const info = service.getLockoutInfo(userId);
      expect(info.isLocked).toBe(true);
      expect(info.failedAttemptCount).toBe(MAX_FAILED_ATTEMPTS);
      expect(info.lockedAt).toBe(currentTime);
      expect(info.lockoutExpiresAt).toBe(currentTime + LOCKOUT_DURATION_MS);
    });

    it('should not increment counter while account is already locked', () => {
      // Lock the account
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }

      // Try more attempts while locked
      const info = service.recordFailedAttempt(userId);
      expect(info.isLocked).toBe(true);
      expect(info.failedAttemptCount).toBe(MAX_FAILED_ATTEMPTS);
    });

    it('should only count failures within the 30-minute window', () => {
      // Record 4 failures
      for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
        service.recordFailedAttempt(userId);
      }

      // Advance time past the 30-minute window
      currentTime += FAILURE_WINDOW_MS + 1;

      // Record one more failure - should not cause lockout since earlier ones expired
      const info = service.recordFailedAttempt(userId);
      expect(info.isLocked).toBe(false);
      expect(info.failedAttemptCount).toBe(1);
    });

    it('should lock when 5 failures happen within 30-minute window even if spaced out', () => {
      // Space failures within the window
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
        currentTime += 5 * 60 * 1000; // 5 minutes between each
      }

      // All 5 within 25 minutes (within the 30-min window)
      // Note: after 5th attempt, time is at +25 min. Check from original attempt perspective.
      // The 5th attempt happens at +20 min, first at 0 min, within 30-min window.
      const info = service.getLockoutInfo(userId);
      expect(info.isLocked).toBe(true);
    });
  });

  describe('recordSuccessfulLogin', () => {
    it('should reset the failure counter on successful login', () => {
      // Record some failures
      for (let i = 0; i < 3; i++) {
        service.recordFailedAttempt(userId);
      }

      // Successful login
      service.recordSuccessfulLogin(userId);

      const info = service.getLockoutInfo(userId);
      expect(info.isLocked).toBe(false);
      expect(info.failedAttemptCount).toBe(0);
    });

    it('should have no effect for users without failure records', () => {
      service.recordSuccessfulLogin(userId);

      const info = service.getLockoutInfo(userId);
      expect(info.isLocked).toBe(false);
      expect(info.failedAttemptCount).toBe(0);
    });
  });

  describe('isAccountLocked', () => {
    it('should return false for a user with no records', () => {
      expect(service.isAccountLocked(userId)).toBe(false);
    });

    it('should return true when account is locked', () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }

      expect(service.isAccountLocked(userId)).toBe(true);
    });

    it('should return false after lockout period expires (auto-unlock)', () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }

      // Advance time past the lockout period
      currentTime += LOCKOUT_DURATION_MS + 1;

      expect(service.isAccountLocked(userId)).toBe(false);
    });

    it('should reset counter after lockout expires', () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }

      // Advance past lockout
      currentTime += LOCKOUT_DURATION_MS + 1;

      // Should be unlocked and counter reset
      expect(service.isAccountLocked(userId)).toBe(false);

      const info = service.getLockoutInfo(userId);
      expect(info.failedAttemptCount).toBe(0);
    });
  });

  describe('getLockoutInfo', () => {
    it('should return default info for unknown user', () => {
      const info = service.getLockoutInfo('unknown-user');

      expect(info).toEqual({
        isLocked: false,
        failedAttemptCount: 0,
        lockedAt: null,
        lockoutExpiresAt: null,
        remainingLockoutMs: null,
      });
    });

    it('should return remaining lockout duration', () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }

      // Advance 5 minutes into lockout
      currentTime += 5 * 60 * 1000;

      const info = service.getLockoutInfo(userId);
      expect(info.isLocked).toBe(true);
      expect(info.remainingLockoutMs).toBe(LOCKOUT_DURATION_MS - 5 * 60 * 1000);
    });

    it('should reset when lockout has expired', () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }

      // Advance past lockout
      currentTime += LOCKOUT_DURATION_MS + 1;

      const info = service.getLockoutInfo(userId);
      expect(info.isLocked).toBe(false);
      expect(info.failedAttemptCount).toBe(0);
      expect(info.lockedAt).toBeNull();
    });
  });

  describe('lockout expiry resets counter (allows re-locking)', () => {
    it('should allow re-locking after lockout expires and new failures occur', () => {
      // First lockout
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }
      expect(service.isAccountLocked(userId)).toBe(true);

      // Wait for lockout to expire
      currentTime += LOCKOUT_DURATION_MS + 1;
      expect(service.isAccountLocked(userId)).toBe(false);

      // Second round of failures → should lock again
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }
      expect(service.isAccountLocked(userId)).toBe(true);
    });
  });

  describe('admin notification and logging', () => {
    it('should log lockout events', () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }

      const events = service.getLockoutEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        userId,
        eventType: 'account_locked',
        timestamp: currentTime,
        failedAttemptCount: MAX_FAILED_ATTEMPTS,
      });
    });

    it('should call admin notifier when account is locked', () => {
      const notifier = vi.fn();
      service.setAdminNotifier(notifier);

      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }

      expect(notifier).toHaveBeenCalledTimes(1);
      expect(notifier).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          eventType: 'account_locked',
          failedAttemptCount: MAX_FAILED_ATTEMPTS,
        })
      );
    });

    it('should not call admin notifier for attempts below threshold', () => {
      const notifier = vi.fn();
      service.setAdminNotifier(notifier);

      for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
        service.recordFailedAttempt(userId);
      }

      expect(notifier).not.toHaveBeenCalled();
    });
  });

  describe('generic error message (no field disclosure)', () => {
    it('should not expose whether username or password was wrong in lockout info', () => {
      // The service does not reveal specifics - it only tracks lockout state
      // The actual "authentication failed" message is returned by the caller (AuthService)
      // We verify the lockout info does not contain credential details
      const info = service.recordFailedAttempt(userId);

      expect(info).not.toHaveProperty('username');
      expect(info).not.toHaveProperty('password');
      expect(info).not.toHaveProperty('reason');
    });
  });

  describe('multiple users isolation', () => {
    it('should track lockout independently per user', () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      // Lock user1
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(user1);
      }

      // User2 has failures but not enough to lock
      for (let i = 0; i < 2; i++) {
        service.recordFailedAttempt(user2);
      }

      expect(service.isAccountLocked(user1)).toBe(true);
      expect(service.isAccountLocked(user2)).toBe(false);

      const info2 = service.getLockoutInfo(user2);
      expect(info2.failedAttemptCount).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all records and events', () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
        service.recordFailedAttempt(userId);
      }

      service.clear();

      expect(service.isAccountLocked(userId)).toBe(false);
      expect(service.getLockoutEvents()).toHaveLength(0);
    });
  });
});
