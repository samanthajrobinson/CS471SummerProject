// backend/scripts/sqlite-to-mysql.mjs
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const sdb = new Database('./data/app.db', { fileMustExist: true });
const pool = await mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  user: process.env.DB_USER, password: process.env.DB_PASS,
  database: process.env.DB_NAME, connectionLimit: 1,
});

const users = sdb.prepare('SELECT * FROM users').all();
for (const u of users) {
  await pool.execute(
    'INSERT IGNORE INTO users (id, handle, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    [u.id, u.handle, u.email, u.password_hash, u.created_at]
  );
}
const items = sdb.prepare('SELECT * FROM closet_items').all();
for (const it of items) {
  await pool.execute(
    `INSERT IGNORE INTO closet_items
     (id, user_id, category, color, brand, size, status, image_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [it.id, it.user_id, it.category, it.color, it.brand, it.size, it.status, it.image_url, it.created_at, it.updated_at]
  );
}
const tags = sdb.prepare('SELECT * FROM item_tags').all();
for (const t of tags) {
  await pool.execute('INSERT IGNORE INTO item_tags (item_id, tag) VALUES (?, ?)', [t.item_id, t.tag.toLowerCase()]);
}
console.log('Done.');
process.exit(0);
