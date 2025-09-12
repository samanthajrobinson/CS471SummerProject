// backend/src/db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'outfit_ai',
  connectionLimit: 10,
  namedPlaceholders: true,
});

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}
export async function exec(sql, params = []) {
  const [res] = await pool.execute(sql, params);
  return res; // res.insertId, res.affectedRows
}
