import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { ENV } from './_core/env';

export interface PortalTokenPayload {
  userId: number;
  email: string;
  role: 'admin' | 'customer';
  clientId?: number;
  /** Fingerprint of the password hash the token was issued against (see passwordFingerprint). */
  pwf?: string;
}

/**
 * Short digest of the stored bcrypt hash. Embedded in the JWT so that any
 * password change/reset (which always produces a new hash) revokes every
 * session issued before it, without a session table or schema change.
 */
export function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

export const PORTAL_COOKIE = 'pathxpress_portal_token';

export function portalCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

/** Token for a DB user row — role/clientId/pwf always come from the row. */
export function generatePortalTokenForUser(user: {
  id: number; email: string; role: 'admin' | 'customer'; clientId: number | null; passwordHash: string;
}): string {
  return generatePortalToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    clientId: user.clientId || undefined,
    pwf: passwordFingerprint(user.passwordHash),
  });
}

const PORTAL_TOKEN_SECRET = ENV.cookieSecret + '_portal'; // Separate secret for portal (using JWT_SECRET from env)
const TOKEN_EXPIRATION = '7d'; // 7 days

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a plain password with a hashed password
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token for portal authentication
 */
export function generatePortalToken(payload: PortalTokenPayload): string {
  return jwt.sign(payload, PORTAL_TOKEN_SECRET, {
    expiresIn: TOKEN_EXPIRATION,
  });
}

/**
 * Verify and decode a portal JWT token
 */
export function verifyPortalToken(token: string): PortalTokenPayload | null {
  try {
    const decoded = jwt.verify(token, PORTAL_TOKEN_SECRET) as PortalTokenPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Validate password strength
 * Minimum 8 characters, at least one letter and one number
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one letter' };
  }
  
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  
  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
