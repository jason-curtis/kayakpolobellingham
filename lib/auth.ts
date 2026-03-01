import crypto from 'crypto';

// For MVP, using simple hashing. In production, use bcryptjs
const ADMIN_PASSWORD_PLAIN = 'marine park tides swirl';

// Generate a stable hash from password for demo
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export const ADMIN_PASSWORD_HASH = hashPassword(ADMIN_PASSWORD_PLAIN);

export function verifyPassword(password: string): boolean {
  return hashPassword(password) === ADMIN_PASSWORD_HASH;
}

export function createAdminSession(): string {
  return crypto.randomBytes(32).toString('hex');
}
