import { Request, Response, NextFunction } from 'express';
import { authService, TokenPayload } from '../services/auth.service.js';
import { UserRole } from '../types/index.js';

// ─── Augment Express Request ─────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// ─── Cookie Parsing Helper ───────────────────────────────────────────────────

/**
 * Extract a cookie value from the Cookie header.
 * In production you'd use cookie-parser middleware, but this keeps dependencies minimal.
 */
function getCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(';').reduce(
    (acc, cookie) => {
      const [key, ...rest] = cookie.trim().split('=');
      acc[key] = rest.join('=');
      return acc;
    },
    {} as Record<string, string>
  );

  return cookies[name];
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────

/**
 * Authentication middleware that validates JWT tokens.
 * Tokens are read from:
 * 1. HttpOnly cookie named 'access_token'
 * 2. Authorization header as Bearer token (fallback for API clients)
 *
 * On success, attaches user payload to req.user.
 * On failure, returns 401 with appropriate error.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Try to get token from HttpOnly cookie first, then Authorization header
  let token = getCookie(req, 'access_token');

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: [],
      },
    });
    return;
  }

  const payload = authService.validateToken(token);

  if (!payload) {
    res.status(401).json({
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Session expired or invalid token. Please log in again.',
        details: [],
      },
    });
    return;
  }

  req.user = payload;
  next();
}

// ─── RBAC Middleware ─────────────────────────────────────────────────────────

/**
 * Role-based access control middleware factory.
 * Creates a middleware that checks if the authenticated user has one of the allowed roles.
 *
 * Must be used AFTER authMiddleware.
 *
 * @param allowedRoles - Array of roles permitted for this route
 */
export function rbacMiddleware(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          details: [],
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to perform this operation',
          details: [
            {
              issue: `Role '${req.user.role}' is not authorized for this action`,
            },
          ],
        },
      });
      return;
    }

    next();
  };
}
