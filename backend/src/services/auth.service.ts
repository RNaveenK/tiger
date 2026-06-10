import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../types/index.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const BCRYPT_SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TokenPayload {
  userId: string;
  username: string;
  role: UserRole;
  sessionId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionInfo {
  userId: string;
  username: string;
  role: UserRole;
  sessionId: string;
  lastActivityAt: number; // Unix timestamp in ms
  createdAt: number;
}

export interface LoginResult {
  tokens: AuthTokens;
  session: SessionInfo;
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number;
  path: string;
}

// ─── Session Store ───────────────────────────────────────────────────────────

/**
 * In-memory session store. In production, this would be backed by Redis.
 */
const sessions = new Map<string, SessionInfo>();

// ─── AuthService ─────────────────────────────────────────────────────────────

export class AuthService {
  /**
   * Hash a plaintext password using bcrypt.
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  /**
   * Compare a plaintext password against a bcrypt hash.
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Authenticate a user and issue JWT tokens.
   * Returns tokens and session info on success, or null if credentials are invalid.
   *
   * Note: Account lockout logic is handled separately in the lockout module.
   * This method assumes the caller has already checked lockout status.
   */
  async login(user: User, password: string): Promise<LoginResult | null> {
    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    const sessionId = generateSessionId();
    const now = Date.now();

    const session: SessionInfo = {
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionId,
      lastActivityAt: now,
      createdAt: now,
    };

    sessions.set(sessionId, session);

    const tokens = this.generateTokens({
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionId,
    });

    return { tokens, session };
  }

  /**
   * Invalidate a session (logout).
   */
  logout(sessionId: string): boolean {
    return sessions.delete(sessionId);
  }

  /**
   * Validate an access token and check session validity.
   * Returns the token payload if valid and session is active, null otherwise.
   */
  validateToken(token: string): TokenPayload | null {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;

      // Check if session still exists and is not expired due to inactivity
      const session = sessions.get(payload.sessionId);
      if (!session) {
        return null;
      }

      const now = Date.now();
      const inactivityDuration = now - session.lastActivityAt;

      if (inactivityDuration > SESSION_INACTIVITY_TIMEOUT_MS) {
        // Session expired due to inactivity - clean up
        sessions.delete(payload.sessionId);
        return null;
      }

      // Update last activity timestamp
      session.lastActivityAt = now;

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Validate a refresh token.
   * Returns payload if valid, null otherwise.
   */
  validateRefreshToken(token: string): TokenPayload | null {
    try {
      const payload = jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;

      // Verify session still exists
      const session = sessions.get(payload.sessionId);
      if (!session) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Refresh tokens - issue new access and refresh tokens.
   */
  refreshTokens(payload: TokenPayload): AuthTokens {
    // Update session activity
    const session = sessions.get(payload.sessionId);
    if (session) {
      session.lastActivityAt = Date.now();
    }

    return this.generateTokens(payload);
  }

  /**
   * Generate access and refresh tokens for a given payload.
   */
  generateTokens(payload: TokenPayload): AuthTokens {
    // Strip any existing JWT claims (exp, iat, nbf) to avoid conflicts with expiresIn
    const cleanPayload: TokenPayload = {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      sessionId: payload.sessionId,
    };

    const accessToken = jwt.sign(cleanPayload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign(cleanPayload, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Get session info by session ID.
   */
  getSession(sessionId: string): SessionInfo | null {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const now = Date.now();
    const inactivityDuration = now - session.lastActivityAt;

    if (inactivityDuration > SESSION_INACTIVITY_TIMEOUT_MS) {
      sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Touch a session to update last activity (keeps session alive).
   */
  touchSession(sessionId: string): boolean {
    const session = sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.lastActivityAt = Date.now();
    return true;
  }

  /**
   * Get cookie options for setting HttpOnly cookie.
   */
  getAccessTokenCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/',
    };
  }

  /**
   * Get cookie options for refresh token.
   */
  getRefreshTokenCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth/refresh',
    };
  }

  /**
   * Clear all sessions (for testing purposes).
   */
  clearSessions(): void {
    sessions.clear();
  }

  /**
   * Get the session inactivity timeout in milliseconds.
   */
  getSessionTimeoutMs(): number {
    return SESSION_INACTIVITY_TIMEOUT_MS;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Export singleton instance
export const authService = new AuthService();
