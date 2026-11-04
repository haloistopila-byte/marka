import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.ts';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest();
const sameSecret = (a: string, b: string) => crypto.timingSafeEqual(sha256(a), sha256(b));

/** Checks a password against a `scrypt$<salt hex>$<hash hex>` string. */
function matchesHash(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function passwordOk(password: string): boolean {
  const { password: plain, passwordHash } = config.basicAuth;
  return plain ? sameSecret(password, plain) : matchesHash(password, passwordHash);
}

// Wrong attempts per IP; an IP that reaches maxFailures is locked out until its window ends.
const failures = new Map<string, { count: number; resetAt: number }>();
// Authorization headers that already passed, so scrypt runs once per browser, not on every request
const verified = new Set<string>();

function lockedOut(ip: string, now: number): boolean {
  const entry = failures.get(ip);
  if (entry && entry.resetAt <= now) failures.delete(ip);
  return (failures.get(ip)?.count || 0) >= config.basicAuth.maxFailures;
}

function recordFailure(ip: string, now: number) {
  if (failures.size > 5000) {
    for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key);
  }
  const entry = failures.get(ip) || { count: 0, resetAt: now + config.basicAuth.lockoutMinutes * 60_000 };
  entry.count += 1;
  failures.set(ip, entry);
}

function credentialsOk(header: string): boolean {
  const key = sha256(header).toString('hex');
  if (verified.has(key)) return true;
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const split = decoded.indexOf(':');
  if (split < 0) return false;
  const ok = sameSecret(decoded.slice(0, split), config.basicAuth.user) && passwordOk(decoded.slice(split + 1));
  if (ok) verified.add(key);
  return ok;
}

/** Password prompt for the whole app, only when a password is configured. /api/health stays open. */
export function basicAuthGate(req: Request, res: Response, next: NextFunction) {
  const { password, passwordHash } = config.basicAuth;
  if ((!password && !passwordHash) || req.path === '/api/health') return next();
  const ip = req.ip || 'unknown';
  const now = Date.now();
  if (lockedOut(ip, now)) {
    res.setHeader('Retry-After', String(config.basicAuth.lockoutMinutes * 60));
    return res.status(429).type('text/plain').send('Terlalu banyak percobaan. Coba lagi nanti.');
  }
  if (credentialsOk(req.headers.authorization || '')) return next();
  if (req.headers.authorization) recordFailure(ip, now);
  res.setHeader('WWW-Authenticate', 'Basic realm="Marka Photobooth", charset="UTF-8"');
  res.status(401).type('text/plain').send('Perlu login.');
}
