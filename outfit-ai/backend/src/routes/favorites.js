import express from "express";
import { authRequired, jwtSecret } from "../auth.js";
import * as DB from "../db.js";

const router = express.Router();
const isSqlite = !!(DB.db && typeof DB.db.prepare === "function");
const q = async (sql, p=[]) => isSqlite ? DB.db.prepare(sql).all(...p) : (await DB.pool.query(sql, p))[0];
const x = async (sql, p=[]) => isSqlite ? DB.db.prepare(sql).run(...p) : (await DB.pool.execute(sql, p))[0];

// Create favorite (returns outfitId)
router.post("/", authRequired(jwtSecret), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.items) ? req.body.items.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "items required" });

    // Create an outfit that references these items
    const ins = await x(
      `INSERT INTO outfits (user_id, items) VALUES (?, ?)`,
      [req.user.id, JSON.stringify(ids)]
    );
    const outfitId = ins.insertId ?? ins.lastInsertRowid;

    // Favorite it
    await x(isSqlite
      ? `INSERT OR IGNORE INTO favorites (user_id, outfit_id) VALUES (?,?)`
      : `INSERT IGNORE INTO favorites (user_id, outfit_id) VALUES (?,?)`,
      [req.user.id, outfitId]
    );

    await x(isSqlite
        ? `INSERT OR IGNORE INTO likes (user_id, outfit_id) VALUES (?,?)`
        : `INSERT IGNORE INTO likes (user_id, outfit_id) VALUES (?,?)`,
        [req.user.id, outfitId]
        );

    const [row] = await q(`SELECT COUNT(*) AS c FROM likes WHERE outfit_id=?`, [outfitId]);
    return res.status(201).json({ outfitId, likes: Number(row?.c || 0) });

    res.status(201).json({ outfitId });
  } catch (e) {
    console.error("POST /favorites", e);
    res.status(500).json({ error: "favorite-failed" });
  }
});

// Unfavorite
router.delete("/:id", authRequired(jwtSecret), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    await x(`DELETE FROM favorites WHERE user_id=? AND outfit_id=?`, [req.user.id, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /favorites/:id", e);
    res.status(500).json({ error: "unfavorite-failed" });
  }
});

// List favorites — no dependency on non-existent columns
router.get("/", authRequired(jwtSecret), async (req, res) => {
  try {
    const rows = await q(
      `
      SELECT
        f.outfit_id AS id,
        o.items,
        COALESCE(l.cnt, 0) AS likes
      FROM favorites f
      JOIN outfits  o ON o.id = f.outfit_id
      LEFT JOIN (
        SELECT outfit_id, COUNT(*) AS cnt
        FROM likes
        GROUP BY outfit_id
      ) l ON l.outfit_id = o.id
      WHERE f.user_id = ?
      ORDER BY o.id DESC
      `,
      [req.user.id]
    );

    const out = [];
    for (const r0 of rows) {
      let ids = [];
      try {
        if (Array.isArray(r0.items)) ids = r0.items;
        else if (typeof r0.items === "string") ids = JSON.parse(r0.items || "[]");
      } catch {}
      let items = [];
      if (ids.length) {
        const ph = ids.map(()=>"?").join(",");
        const got = await q(
          `SELECT id, category, brand, color, size, status, image_url
             FROM closet_items
            WHERE id IN (${ph})`, ids
        );
        const map = new Map(got.map(i => [i.id, i]));
        items = ids.map(id => map.get(id)).filter(Boolean);
      }
      out.push({
        id: r0.id,
        occasion: null,         // column not present in your schema
        tempF: null,            // column not present in your schema
        likes: Number(r0.likes || 0),
        items
      });
    }

    res.json(out);
  } catch (e) {
    console.error("GET /favorites", e);
    res.status(500).json({ error: "favorites-load-failed", detail: e.message });
  }
});

export default router;
