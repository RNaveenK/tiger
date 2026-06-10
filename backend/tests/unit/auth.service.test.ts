import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../../src/services/auth.service.js';
import { User, UserRole } from '../../src/types/index.js';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    authService.clearSessions();
  });

  function createMockUser(overrides: Partial<User> = {}): User {
    return {
      id: 'user-123',
      username: 'testuser',
      passwordHash: '', // will be set in tests that need it
      role: UserRole.StoreOperator,
      locale: 'en-US',
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  describe('hashPassword / verifyPassword', () => {
    it('should hash a password and verify it correctly', async () => {
      const password = 'MySecureP@ss123';
      const hash = await authService.hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);

      const isValid = await authService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await authService.hashPassword('correctPassword');
      const isValid = await authService.verifyPassword('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should produce different hashes for same password (salted)', async () => {
      const password = 'samePassword';
      const hash1 = await authService.hashPassword(password);
      const hash2 = await authService.hashPassword(password);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('login', () => {
    it('should return tokens and session on valid credentials', async () => {
      const password = 'validPassword123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      const result = await authService.login(user, password);

      expect(result).not.toBeNull();
      expect(result!.tokens.accessToken).toBeDefined();
      expect(result!.tokens.refreshToken).toBeDefined();
      expect(result!.session.userId).toBe(user.id);
      expect(result!.session.username).toBe(user.username);
      expect(result!.session.role).toBe(user.role);
      expect(result!.session.sessionId).toBeDefined();
      expect(result!.session.lastActivityAt).toBeGreaterThan(0);
    });

    it('should return null on invalid password', async () => {
      const hash = await authService.hashPassword('correctPassword');
      const user = createMockUser({ passwordHash: hash });

      const result = await authService.login(user, 'wrongPassword');
      expect(result).toBeNull();
    });

    it('should create a retrievable session on login', async () => {
      const password = 'testPass';
      const hash = await authService.hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      const result = await authService.login(user, password);
      expect(result).not.toBeNull();

      const session = authService.getSession(result!.session.sessionId);
      expect(session).not.toBeNull();
      expect(session!.userId).toBe(user.id);
    });
  });

  describe('validateToken', () => {
    it('should validate a freshly issued access token', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser({ passwordHash: hash, role: UserRole.OperationsTeam });

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      const payload = authService.validateToken(loginResult!.tokens.accessToken);
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe(user.id);
      expect(payload!.role).toBe(UserRole.OperationsTeam);
    });

    it('should return null for invalid token', () => {
      const payload = authService.validateToken('invalid.token.here');
      expect(payload).toBeNull();
    });

    it('should return null for token with non-existent session', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      // Logout (remove session)
      authService.logout(loginResult!.session.sessionId);

      // Token should now be invalid since session is gone
      const payload = authService.validateToken(loginResult!.tokens.accessToken);
      expect(payload).toBeNull();
    });

    it('should update lastActivityAt on successful validation', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      const loginResult = await authService.login(user, password);
      const sessionBefore = authService.getSession(loginResult!.session.sessionId);
      const activityBefore = sessionBefore!.lastActivityAt;

      // Small delay to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      authService.validateToken(loginResult!.tokens.accessToken);

      const sessionAfter = authService.getSession(loginResult!.session.sessionId);
      expect(sessionAfter!.lastActivityAt).toBeGreaterThanOrEqual(activityBefore);
    });
  });

  describe('logout', () => {
    it('should remove session on logout', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      const result = authService.logout(loginResult!.session.sessionId);
      expect(result).toBe(true);

      const session = authService.getSession(loginResult!.session.sessionId);
      expect(session).toBeNull();
    });

    it('should return false for non-existent session', () => {
      const result = authService.logout('non-existent-session');
      expect(result).toBe(false);
    });
  });

  describe('session timeout', () => {
    it('should have 30-minute inactivity timeout', () => {
      expect(authService.getSessionTimeoutMs()).toBe(30 * 60 * 1000);
    });

    it('should invalidate session after 30 minutes of inactivity', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      // Manually set lastActivityAt to 31 minutes ago
      const session = authService.getSession(loginResult!.session.sessionId);
      expect(session).not.toBeNull();
      session!.lastActivityAt = Date.now() - 31 * 60 * 1000;

      // Now validation should fail due to inactivity
      const payload = authService.validateToken(loginResult!.tokens.accessToken);
      expect(payload).toBeNull();

      // Session should be cleaned up
      const sessionAfter = authService.getSession(loginResult!.session.sessionId);
      expect(sessionAfter).toBeNull();
    });

    it('should keep session alive when activity is within timeout', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      // Set lastActivityAt to 29 minutes ago (under the 30 min threshold)
      const session = authService.getSession(loginResult!.session.sessionId);
      session!.lastActivityAt = Date.now() - 29 * 60 * 1000;

      // Validation should still succeed
      const payload = authService.validateToken(loginResult!.tokens.accessToken);
      expect(payload).not.toBeNull();
    });
  });

  describe('refreshTokens', () => {
    it('should issue new tokens from a valid refresh token', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      const refreshPayload = authService.validateRefreshToken(loginResult!.tokens.refreshToken);
      expect(refreshPayload).not.toBeNull();

      const newTokens = authService.refreshTokens(refreshPayload!);
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      // New tokens should be valid JWTs that can be validated
      const validatedPayload = authService.validateToken(newTokens.accessToken);
      expect(validatedPayload).not.toBeNull();
      expect(validatedPayload!.userId).toBe(user.id);
    });

    it('should reject invalid refresh token', () => {
      const payload = authService.validateRefreshToken('invalid.refresh.token');
      expect(payload).toBeNull();
    });
  });

  describe('cookie options', () => {
    it('should return HttpOnly cookie options for access token', () => {
      const options = authService.getAccessTokenCookieOptions();
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.maxAge).toBe(15 * 60 * 1000);
      expect(options.path).toBe('/');
    });

    it('should return HttpOnly cookie options for refresh token', () => {
      const options = authService.getRefreshTokenCookieOptions();
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
      expect(options.path).toBe('/api/auth/refresh');
    });
  });

  describe('touchSession', () => {
    it('should update lastActivityAt for existing session', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      const loginResult = await authService.login(user, password);
      const sessionBefore = authService.getSession(loginResult!.session.sessionId);
      const actBefore = sessionBefore!.lastActivityAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = authService.touchSession(loginResult!.session.sessionId);
      expect(result).toBe(true);

      const sessionAfter = authService.getSession(loginResult!.session.sessionId);
      expect(sessionAfter!.lastActivityAt).toBeGreaterThanOrEqual(actBefore);
    });

    it('should return false for non-existent session', () => {
      const result = authService.touchSession('nonexistent');
      expect(result).toBe(false);
    });
  });
});
