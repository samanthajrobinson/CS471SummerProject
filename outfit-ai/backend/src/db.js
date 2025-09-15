// backend/src/db.js
import { resolve } from "path";
import dotenv from "dotenv";
dotenv.config({ path: resolve(process.cwd(), ".env"), override: true });

const CLIENT = (process.env.DB_CLIENT || process.env.MYSQL_CLIENT || "sqlite")
  .trim()
  .toLowerCase();

let query;
let execute;
let isSqlite;

if (CLIENT === "mysql") {
  // ---- MySQL ----
  const host = process.env.DB_HOST || process.env.MYSQL_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
  const user = process.env.DB_USER || process.env.MYSQL_USER || "";
  const password =
    process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || "";
  const database =
    process.env.DB_NAME ||
    process.env.MYSQL_DB ||
    process.env.MYSQL_DATABASE ||
    "outfit_ai";

  const { createPool } = await import("mysql2/promise");
  const pool = createPool({
    host,
    port,
    user,
    password, // must be passed even if empty
    database,
    connectionLimit: 10,
    waitForConnections: true,
  });

  console.log(
    `[db] MySQL ${user}@${host}:${port}/${database} (password ${
      password ? "set" : "EMPTY"
    })`
  );

  query = async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return rows;
  };
  execute = async (sql, params = []) => {
    const [res] = await pool.execute(sql, params);
    return res;
  };
  isSqlite = false;
} else {
  // ---- SQLite ----
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(resolve(process.cwd(), "data", "app.db"));

  console.log(`[db] SQLite data/app.db`);

  query = (sql, params = []) => {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  };
  execute = (sql, params = []) => {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  };
  isSqlite = true;
}

// top-level exports (no exports inside blocks)
export { query, execute, isSqlite };
// handy aliases if other files expect these names
export const q = query;
export const x = execute;
export default { query, execute, isSqlite };
