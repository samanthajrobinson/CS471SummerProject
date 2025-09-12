// backend/src/routes/discover.js
import express from "express";
import * as DB from "../db.js";
import { authRequired, jwtSecret } from "../auth.js";

const router = express.Router();

// support both sqlite and mysql via the same helpers
const isSqlite = !!(DB.db && typeof DB.db.prepare === "function");
const q = async (sql, p = []) =>
  isSqlite ? DB.db.prepare(sql).all(...p) : (await DB.pool.query(sql, p))[0];

async function fetchItemsByIds(ids) {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  const rows = await q(
    `SELECT id, category, brand, color, size, status, image_url
       FROM closet_items
      WHERE id IN (${ph})`,
    ids
  );
  const map = new Map(rows.map(r => [r.id, r]));
  return ids.map(id => map.get(id)).filter(Boolean);
}

// GET /discover  (add ?includeMine=1 to also see your own outfits)
router.get("/", authRequired(jwtSecret), async (req, res) => {
  try {
    const limit  = Math.min(24, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * limit;
    const includeMine = String(req.query.includeMine || "") === "1";

    // first param is always for the EXISTS(...) liked_by_me check
    const whereClause = includeMine ? "1=1" : "o.user_id <> ?";
    const params = includeMine
      ? [req.user.id,            /* for EXISTS */
         limit, offset]
      : [req.user.id,            /* for EXISTS */
         req.user.id,            /* for o.user_id <> ? */
         limit, offset];

    const rows = await q(
      `
      SELECT
        o.id,
        o.items,
        COALESCE(l.cnt, 0) AS likes,
        EXISTS(
          SELECT 1 FROM likes lk
           WHERE lk.user_id = ? AND lk.outfit_id = o.id
        ) AS liked_by_me
      FROM outfits o
      LEFT JOIN (
        SELECT outfit_id, COUNT(*) AS cnt
          FROM likes
         GROUP BY outfit_id
      ) l ON l.outfit_id = o.id
      WHERE ${whereClause}
      ORDER BY likes DESC, o.id DESC
      LIMIT ? OFFSET ?
      `,
      params
    );

    const result = [];
    for (const r of rows) {
      let ids = [];
      try {
        ids = Array.isArray(r.items) ? r.items : JSON.parse(r.items || "[]");
      } catch {}
      const items = await fetchItemsByIds(ids);
      result.push({
        id: r.id,
        items,
        likes: Number(r.likes || 0),
        liked_by_me: !!r.liked_by_me,
      });
    }

    res.json(result);
  } catch (e) {
    console.error("GET /discover", e);
    res.status(500).json({ error: "discover-load-failed", detail: e.message });
  }
});

export default router;
