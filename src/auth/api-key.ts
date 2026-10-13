import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// Format: mk_<12 hex prefix>_<43 char base64url secret>. The prefix is stored in plain text and used
// to find the client row; the whole key is only ever stored as a SHA-256 hash.
const API_KEY_PATTERN = /^mk_([0-9a-f]{12})_[A-Za-z0-9_-]{43}$/;

export interface GeneratedApiKey {
  key: string;
  prefix: string;
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  return buildApiKey(randomBytes(6).toString('hex'), randomBytes(32).toString('base64url'));
}

// Exposed for the seed, which needs stable keys across runs.
export function buildApiKey(prefix: string, secret: string): GeneratedApiKey {
  const key = `mk_${prefix}_${secret}`;
  if (!API_KEY_PATTERN.test(key)) throw new Error('Invalid API key parts');
  return { key, prefix, hash: hashApiKey(key) };
}

export function parseApiKeyPrefix(key: string): string | undefined {
  return API_KEY_PATTERN.exec(key)?.[1];
}

// Keys are 256-bit random, so a fast hash is enough (no bcrypt needed).
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function apiKeyMatches(key: string, storedHash: string): boolean {
  const a = Buffer.from(hashApiKey(key), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
