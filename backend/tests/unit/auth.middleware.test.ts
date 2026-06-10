import { describe, it, expect, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { authMiddleware, rbacMiddleware } from '../../src/middleware/auth.middleware.js';
import { AuthService } from '../../src/services/auth.service.js';
import { User, UserRole } from '../../src/types/index.js';

describe('Auth Middleware', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    authService.clearSessions();
  });

  function createMockReq(overrides: Partial<Request> = {}): Request {
    return {
      headers: {},
      ...overrides,
    } as unknown as Request;
  }

  function createMockRes(): Response & { statusCode: number; body: unknown } {
    const res = {
      statusCode: 0,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: unknown) {
        this.body = data;
        return this;
      },
    };
    return res as unknown as Response & { statusCode: number; body: unknown };
  }

  function createMockUser(role: UserRole = UserRole.StoreOperator): User {
    return {
      id: 'user-456',
      username: 'testuser',
      passwordHash: '',
      role,
      locale: 'en-US',
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
  }

  describe('authMiddleware', () => {
    it('should return 401 when no token is provided', () => {
      const req = createMockReq();
      const res = createMockRes();
      let nextCalled = false;

      authMiddleware(req, res, () => {
        nextCalled = true;
      });

      expect(res.statusCode).toBe(401);
      expect((res.body as any).error.code).toBe('UNAUTHORIZED');
      expect(nextCalled).toBe(false);
    });

    it('should authenticate with valid Bearer token in Authorization header', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser();
      user.passwordHash = hash;

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      const req = createMockReq({
        headers: {
          authorization: `Bearer ${loginResult!.tokens.accessToken}`,
        },
      });
      const res = createMockRes();
      let nextCalled = false;

      authMiddleware(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.user).toBeDefined();
      expect(req.user!.userId).toBe(user.id);
      expect(req.user!.role).toBe(UserRole.StoreOperator);
    });

    it('should authenticate with valid token in cookie', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser(UserRole.OperationsTeam);
      user.passwordHash = hash;

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      const req = createMockReq({
        headers: {
          cookie: `access_token=${loginResult!.tokens.accessToken}`,
        },
      });
      const res = createMockRes();
      let nextCalled = false;

      authMiddleware(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.user).toBeDefined();
      expect(req.user!.role).toBe(UserRole.OperationsTeam);
    });

    it('should return 401 for invalid/expired token', () => {
      const req = createMockReq({
        headers: {
          authorization: 'Bearer invalid.token.here',
        },
      });
      const res = createMockRes();
      let nextCalled = false;

      authMiddleware(req, res, () => {
        nextCalled = true;
      });

      expect(res.statusCode).toBe(401);
      expect((res.body as any).error.code).toBe('SESSION_EXPIRED');
      expect(nextCalled).toBe(false);
    });

    it('should return 401 when session is expired due to inactivity', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser();
      user.passwordHash = hash;

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      // Expire the session by setting lastActivityAt to 31 minutes ago
      const session = authService.getSession(loginResult!.session.sessionId);
      session!.lastActivityAt = Date.now() - 31 * 60 * 1000;

      const req = createMockReq({
        headers: {
          authorization: `Bearer ${loginResult!.tokens.accessToken}`,
        },
      });
      const res = createMockRes();
      let nextCalled = false;

      authMiddleware(req, res, () => {
        nextCalled = true;
      });

      expect(res.statusCode).toBe(401);
      expect(nextCalled).toBe(false);
    });
  });

  describe('rbacMiddleware', () => {
    it('should allow access for permitted role', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser(UserRole.OperationsTeam);
      user.passwordHash = hash;

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      const req = createMockReq({
        headers: {
          authorization: `Bearer ${loginResult!.tokens.accessToken}`,
        },
      });
      const res = createMockRes();

      // First run auth middleware
      let authNext = false;
      authMiddleware(req, res, () => {
        authNext = true;
      });
      expect(authNext).toBe(true);

      // Then run RBAC middleware
      const rbac = rbacMiddleware(UserRole.OperationsTeam, UserRole.Admin);
      let rbacNext = false;
      rbac(req, res, () => {
        rbacNext = true;
      });

      expect(rbacNext).toBe(true);
    });

    it('should deny access for unauthorized role', async () => {
      const password = 'test123';
      const hash = await authService.hashPassword(password);
      const user = createMockUser(UserRole.StoreOperator);
      user.passwordHash = hash;

      const loginResult = await authService.login(user, password);
      expect(loginResult).not.toBeNull();

      const req = createMockReq({
        headers: {
          authorization: `Bearer ${loginResult!.tokens.accessToken}`,
        },
      });
      const res = createMockRes();

      // First run auth middleware
      authMiddleware(req, res, () => {});

      // Then run RBAC middleware - only Operations Team allowed
      const rbac = rbacMiddleware(UserRole.OperationsTeam);
      let rbacNext = false;
      rbac(req, res, () => {
        rbacNext = true;
      });

      expect(rbacNext).toBe(false);
      expect(res.statusCode).toBe(403);
      expect((res.body as any).error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should return 401 when no user is attached', () => {
      const req = createMockReq();
      const res = createMockRes();

      const rbac = rbacMiddleware(UserRole.Admin);
      let rbacNext = false;
      rbac(req, res, () => {
        rbacNext = true;
      });

      expect(rbacNext).toBe(false);
      expect(res.statusCode).toBe(401);
    });
  });
});
