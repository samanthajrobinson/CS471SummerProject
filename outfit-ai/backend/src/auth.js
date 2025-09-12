// backend/src/auth.js
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

/** JWT secret (from .env or safe dev default) */
export const jwtSecret = process.env.JWT_SECRET || 'dev_super_secret_change_me';

/** Hash and verify */
export async function hashPassword(pw) {
  return bcrypt.hash(String(pw), 10);
}
export async function verifyPassword(pw, hash) {
  return bcrypt.compare(String(pw), String(hash || ''));
}

/** Make a JWT (default 7d) */
export function signToken(payload, opts = {}) {
  const expiresIn = opts.expiresIn || '7d';
  return jwt.sign(payload, jwtSecret, { expiresIn });
}

/** Set the auth cookie on response */
export function setAuthCookie(res, token, opts = {}) {
  const secure = process.env.NODE_ENV === 'production';
  const days = opts.days ?? 7;
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: days * 24 * 60 * 60 * 1000,
  });
}

/** Minimal cookie parser (so we don’t need cookie-parser) */
function parseCookies(req) {
  const header = req.headers?.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) {
      const k = part.slice(0, i).trim();
      const v = decodeURIComponent(part.slice(i + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

/** Require a valid JWT (reads Bearer token or `token` cookie) */
export function authRequired(secret = jwtSecret) {
  return (req, res, next) => {
    try {
      let token = null;
      const auth = req.headers['authorization'];
      if (auth && auth.startsWith('Bearer ')) token = auth.slice(7);
      if (!token) token = (req.cookies || parseCookies(req)).token;
      if (!token) return res.status(401).json({ error: 'auth required' });
      const payload = jwt.verify(token, secret);
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'invalid token' });
    }
  };
}

/** Optional auth: attaches req.user if valid, otherwise continues */
export function authOptional(secret = jwtSecret) {
  return (req, _res, next) => {
    try {
      let token = null;
      const auth = req.headers['authorization'];
      if (auth && auth.startsWith('Bearer ')) token = auth.slice(7);
      if (!token) token = (req.cookies || parseCookies(req)).token;
      if (token) {
        const payload = jwt.verify(token, secret);
        req.user = payload;
      }
    } catch {}
    next();
  };
}
