import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware, rbacMiddleware } from '../../src/middleware/rbac.middleware.js';
import { UserRole } from '../../src/types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('authMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('should return 401 when no Authorization header is present', () => {
    const req = createMockRequest();
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization token',
        details: [],
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header does not start with Bearer', () => {
    const req = createMockRequest({ headers: { authorization: 'Basic abc123' } });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is invalid', () => {
    const req = createMockRequest({ headers: { authorization: 'Bearer invalid.token.here' } });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
        details: [],
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should attach user context and call next when token is valid', () => {
    const payload = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      username: 'testuser',
      role: UserRole.StoreOperator,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const req = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(req.user).toEqual({
      id: payload.id,
      username: payload.username,
      role: payload.role,
    });
    expect(next).toHaveBeenCalled();
  });

  it('should return 401 when token is expired', () => {
    const payload = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      username: 'testuser',
      role: UserRole.OperationsTeam,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' });
    const req = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    const res = createMockResponse();

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('rbacMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('should return 401 when req.user is not set', () => {
    const middleware = rbacMiddleware([UserRole.StoreOperator]);
    const req = createMockRequest();
    const res = createMockResponse();

    middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: [],
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when user role is not in allowed roles', () => {
    const middleware = rbacMiddleware([UserRole.OperationsTeam]);
    const req = createMockRequest();
    (req as any).user = {
      id: '123',
      username: 'storeop',
      role: UserRole.StoreOperator,
    };
    const res = createMockResponse();

    middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        details: [
          {
            field: 'role',
            issue: `Role '${UserRole.StoreOperator}' is not authorized for this operation`,
          },
        ],
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next when user role is in allowed roles', () => {
    const middleware = rbacMiddleware([UserRole.StoreOperator, UserRole.Admin]);
    const req = createMockRequest();
    (req as any).user = {
      id: '123',
      username: 'storeop',
      role: UserRole.StoreOperator,
    };
    const res = createMockResponse();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  describe('Role-based access scenarios', () => {
    it('Store Operator can access upload endpoints', () => {
      const middleware = rbacMiddleware([UserRole.StoreOperator, UserRole.Admin]);
      const req = createMockRequest();
      (req as any).user = { id: '1', username: 'op1', role: UserRole.StoreOperator };
      const res = createMockResponse();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('Store Operator can access search endpoints (read-only)', () => {
      const middleware = rbacMiddleware([UserRole.StoreOperator, UserRole.OperationsTeam, UserRole.Admin]);
      const req = createMockRequest();
      (req as any).user = { id: '1', username: 'op1', role: UserRole.StoreOperator };
      const res = createMockResponse();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('Store Operator cannot access edit endpoints', () => {
      const middleware = rbacMiddleware([UserRole.OperationsTeam, UserRole.Admin]);
      const req = createMockRequest();
      (req as any).user = { id: '1', username: 'op1', role: UserRole.StoreOperator };
      const res = createMockResponse();

      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
    });

    it('Operations Team can access search endpoints', () => {
      const middleware = rbacMiddleware([UserRole.StoreOperator, UserRole.OperationsTeam, UserRole.Admin]);
      const req = createMockRequest();
      (req as any).user = { id: '2', username: 'ops1', role: UserRole.OperationsTeam };
      const res = createMockResponse();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('Operations Team can access edit endpoints', () => {
      const middleware = rbacMiddleware([UserRole.OperationsTeam, UserRole.Admin]);
      const req = createMockRequest();
      (req as any).user = { id: '2', username: 'ops1', role: UserRole.OperationsTeam };
      const res = createMockResponse();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('Operations Team cannot access upload endpoints', () => {
      const middleware = rbacMiddleware([UserRole.StoreOperator, UserRole.Admin]);
      const req = createMockRequest();
      (req as any).user = { id: '2', username: 'ops1', role: UserRole.OperationsTeam };
      const res = createMockResponse();

      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
    });

    it('Admin can access all endpoints', () => {
      const uploadMiddleware = rbacMiddleware([UserRole.StoreOperator, UserRole.Admin]);
      const editMiddleware = rbacMiddleware([UserRole.OperationsTeam, UserRole.Admin]);
      const searchMiddleware = rbacMiddleware([UserRole.StoreOperator, UserRole.OperationsTeam, UserRole.Admin]);

      const req = createMockRequest();
      (req as any).user = { id: '3', username: 'admin1', role: UserRole.Admin };

      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const res3 = createMockResponse();
      const next1 = vi.fn();
      const next2 = vi.fn();
      const next3 = vi.fn();

      uploadMiddleware(req, res1, next1);
      editMiddleware(req, res2, next2);
      searchMiddleware(req, res3, next3);

      expect(next1).toHaveBeenCalled();
      expect(next2).toHaveBeenCalled();
      expect(next3).toHaveBeenCalled();
    });
  });
});
