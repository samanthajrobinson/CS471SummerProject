// backend/src/routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import {
  hashPassword, verifyPassword, signToken, setAuthCookie,
  authRequired, jwtSecret
} from '../auth.js';

// Works with either MySQL (pool/query/exec) or SQLite (db.prepare)
import * as DB from '../db.js';
const hasSqlite = !!(DB.db && typeof DB.db.prepare === 'function');
const query = async (sql, params=[]) => {
  if (hasSqlite) return DB.db.prepare(sql).all(...params);
  if (DB.query) return DB.query(sql, params);
  const [rows] = await DB.pool.query(sql, params); return rows;
};
const exec = async (sql, params=[]) => {
  if (hasSqlite) return DB.db.prepare(sql).run(...params);
  if (DB.exec) return DB.exec(sql, params);
  const [res] = await DB.pool.execute(sql, params); return res;
};

const r = express.Router();
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'').toLowerCase());

/* ---------------- REGISTER ---------------- */
r.post('/register', async (req, res) => {
  try {
    const { email, password, handle } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const dupe = await query(
      'SELECT id FROM users WHERE email=? OR (? IS NOT NULL AND handle=?) LIMIT 1',
      [email, handle ?? null, handle ?? null]
    );
    if (dupe.length) return res.status(409).json({ error: 'account already exists' });

    const pwHash = hashPassword ? await hashPassword(password) : await bcrypt.hash(password, 10);
    const info = await exec('INSERT INTO users (handle,email,password_hash) VALUES (?,?,?)',
      [handle ?? null, email, pwHash]);
    const userId = info.insertId ?? info.lastInsertRowid ?? null;

    const token = signToken({ id: userId, email, handle: handle ?? null });
    setAuthCookie(res, token);
    return res.status(201).json({ id: userId, email, handle: handle ?? null, token });
  } catch (e) {
    console.error('register error:', e);
    return res.status(400).json({ error: 'failed to register' });
  }
});

/* ----------------- LOGIN ------------------ */
r.post('/login', async (req, res) => {
  try {
    const { identity, email, handle, password } = req.body || {};
    const idKey = identity ?? email ?? handle;
    if (!idKey || !password) return res.status(400).json({ error: 'identity and password required' });

    const byEmail = isEmail(idKey);
    const rows = await query(
      byEmail ? 'SELECT * FROM users WHERE email=? LIMIT 1'
              : 'SELECT * FROM users WHERE handle=? OR email=? LIMIT 1',
      byEmail ? [idKey] : [idKey, idKey]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = verifyPassword ? await verifyPassword(password, user.password_hash)
                              : await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const token = signToken({ id: user.id, email: user.email, handle: user.handle ?? null });
    setAuthCookie(res, token);
    return res.json({ id: user.id, email: user.email, handle: user.handle ?? null, token });
  } catch (e) {
    console.error('login error:', e);
    return res.status(400).json({ error: 'failed to login' });
  }
});

/* ----------------- LOGOUT ----------------- */
r.post('/logout', (_req, res) => {
  const secure = process.env.NODE_ENV === 'production';
  res.clearCookie?.('token', { httpOnly: true, sameSite: 'lax', secure, path: '/' });
  return res.json({ ok: true });
});

/* -------------------- ME ------------------ */
r.get('/me', authRequired(jwtSecret), async (req, res) => {
  try {
    const rows = await query('SELECT id,email,handle FROM users WHERE id=? LIMIT 1', [req.user.id]);
    res.json(rows[0] ?? { id: req.user.id, email: req.user.email, handle: req.user.handle ?? null });
  } catch (e) {
    console.error('me error:', e);
    res.status(400).json({ error: 'failed to fetch user' });
  }
});

export default r;
