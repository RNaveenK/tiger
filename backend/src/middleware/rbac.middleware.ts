import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole, ErrorEnvelope } from '../types/index.js';

/**
 * Represents the authenticated user context attached to Express requests.
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
}

/**
 * Extend Express Request to include user context after authentication.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

/**
 * Middleware that validates a JWT token from the Authorization header
 * and attaches the decoded user context to `req.user`.
 *
 * Returns 401 if the token is missing, malformed, or invalid.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error: ErrorEnvelope = {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization token',
        details: [],
      },
    };
    res.status(401).json(error);
    return;
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;

    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    };

    next();
  } catch {
    const error: ErrorEnvelope = {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
        details: [],
      },
    };
    res.status(401).json(error);
    return;
  }
}

/**
 * Factory function that creates RBAC middleware to enforce role-based access control.
 *
 * Role permissions (from requirements):
 * - Store Operator: upload + read-only search
 * - Operations Team: search + view + edit
 * - Admin: all operations
 *
 * @param allowedRoles - Array of roles permitted to access the protected resource
 * @returns Express middleware that checks `req.user.role` against the allowed list
 */
export function rbacMiddleware(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      const error: ErrorEnvelope = {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          details: [],
        },
      };
      res.status(401).json(error);
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      const error: ErrorEnvelope = {
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          details: [
            {
              field: 'role',
              issue: `Role '${user.role}' is not authorized for this operation`,
            },
          ],
        },
      };
      res.status(403).json(error);
      return;
    }

    next();
  };
}
