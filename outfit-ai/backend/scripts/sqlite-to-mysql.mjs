// backend/scripts/sqlite-to-mysql.mjs
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

// --- configure paths/creds ---
const SQLITE_PATH = './data/app.db';
const pool = await mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'outfit',
  password: process.env.DB_PASS || 'outfitpw',
  database: process.env.DB_NAME || 'outfit_ai',
  connectionLimit: 1,
});

const sdb = new Database(SQLITE_PATH, { fileMustExist: true });
const q = (sql) => sdb.prepare(sql);

// helper
async function insertIgnore(conn, sql, params) {
  try { await conn.execute(sql, params); } catch (e) { /* ignore dup */ }
}

console.log('Reading from SQLite:', SQLITE_PATH);

// migrate users
{
  const rows = q('SELECT * FROM users').all();
  console.log(`users: ${rows.length}`);
  for (const u of rows) {
    await insertIgnore(pool, `
      INSERT IGNORE INTO users (id, handle, email, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [u.id, u.handle, u.email, u.password_hash, u.created_at]);
  }
}

// migrate closet_items
{
  const rows = q('SELECT * FROM closet_items').all();
  console.log(`closet_items: ${rows.length}`);
  for (const it of rows) {
    await insertIgnore(pool, `
      INSERT IGNORE INTO closet_items
      (id, user_id, category, color, brand, size, status, image_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      it.id, it.user_id, it.category, it.color, it.brand, it.size, it.status,
      it.image_url, it.created_at, it.updated_at
    ]);
  }
}

// migrate item_tags
{
  const rows = q('SELECT * FROM item_tags').all();
  console.log(`item_tags: ${rows.length}`);
  for (const t of rows) {
    await insertIgnore(pool, `
      INSERT IGNORE INTO item_tags (item_id, tag) VALUES (?, ?)
    `, [t.item_id, String(t.tag).toLowerCase()]);
  }
}

// migrate outfits (if you stored any)
if (sdb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='outfits'").get()) {
  const rows = q('SELECT * FROM outfits').all();
  console.log(`outfits: ${rows.length}`);
  for (const o of rows) {
    await insertIgnore(pool, `
      INSERT IGNORE INTO outfits (id, user_id, items, created_at)
      VALUES (?, ?, ?, ?)
    `, [o.id, o.user_id, o.items, o.created_at]);
  }
}

// migrate favorites
if (sdb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='favorites'").get()) {
  const rows = q('SELECT * FROM favorites').all();
  console.log(`favorites: ${rows.length}`);
  for (const f of rows) {
    await insertIgnore(pool, `
      INSERT IGNORE INTO favorites (user_id, outfit_id, created_at)
      VALUES (?, ?, ?)
    `, [f.user_id, f.outfit_id, f.created_at]);
  }
}

console.log('Done.');
process.exit(0);
