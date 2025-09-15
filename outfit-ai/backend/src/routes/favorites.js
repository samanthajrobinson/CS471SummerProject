// backend/src/routes/favorites.js
import { Router } from "express";
import { query as q, execute as x, isSqlite } from "../db.js";
import { authRequired, jwtSecret } from "../auth.js";

const router = Router();
const INSERT_IGNORE = (table, cols) =>
  isSqlite
    ? `INSERT OR IGNORE INTO ${table} (${cols}) VALUES (?, ?)`
    : `INSERT IGNORE INTO ${table} (${cols}) VALUES (?, ?)`;

// helper: count likes on an outfit
async function countLikes(outfitId) {
  const [row] = await q(
    `SELECT COUNT(*) AS c FROM favorites WHERE outfit_id = ?`,
    [outfitId]
  );
  return Number(row?.c || 0);
}

// helper: parse items field that may be JSON string or array
function parseItems(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const j = JSON.parse(raw || "[]");
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

// POST /favorites  (favorite an existing outfit or create from items[])
router.post("/", authRequired(jwtSecret), async (req, res) => {
  try {
    const userId = req.user.id;
    const outfitIdBody = Number(req.body?.outfitId) || null;
    let outfitId = outfitIdBody;

    if (!outfitId) {
      const ids = Array.isArray(req.body?.items)
        ? req.body.items.map(Number).filter(Boolean)
        : [];
      if (!ids.length) return res.status(400).json({ error: "items-required" });

      const ins = await x(
        `INSERT INTO outfits (user_id, items) VALUES (?, ?)`,
        [userId, JSON.stringify(ids)]
      );
      outfitId = isSqlite ? ins.lastInsertRowid : ins.insertId;
    }

    await x(INSERT_IGNORE("favorites", "user_id, outfit_id"), [userId, outfitId]);
    const likes = await countLikes(outfitId);

    res.status(outfitIdBody ? 200 : 201).json({ outfitId, likes });
  } catch (e) {
    console.error("POST /favorites", e);
    res.status(500).json({ error: "favorite-failed" });
  }
});

// DELETE /favorites/:outfitId
router.delete("/:outfitId", authRequired(jwtSecret), async (req, res) => {
  try {
    const userId = req.user.id;
    const outfitId = Number(req.params.outfitId);
    if (!outfitId) return res.status(400).json({ error: "bad-id" });

    await x(`DELETE FROM favorites WHERE user_id = ? AND outfit_id = ?`, [
      userId, outfitId,
    ]);
    const likes = await countLikes(outfitId);
    res.json({ ok: true, outfitId, likes });
  } catch (e) {
    console.error("DELETE /favorites/:outfitId", e);
    res.status(500).json({ error: "unfavorite-failed" });
  }
});

// GET /favorites  (hydrate items for rendering with images)
router.get("/", authRequired(jwtSecret), async (req, res) => {
  try {
    const userId = req.user.id;

    const favs = await q(
      `
      SELECT
        o.id,
        o.user_id AS owner_id,
        o.items,
        COALESCE(l.cnt, 0) AS likes
      FROM favorites f
      JOIN outfits  o ON o.id = f.outfit_id
      LEFT JOIN (
        SELECT outfit_id, COUNT(*) AS cnt
        FROM favorites
        GROUP BY outfit_id
      ) l ON l.outfit_id = o.id
      WHERE f.user_id = ?
      ORDER BY o.id DESC
      `,
      [userId]
    );

    // Collect unique item IDs across all outfits
    const allIds = new Set();
    const parsed = favs.map((r) => {
      const arr = parseItems(r.items).map((x) =>
        typeof x === "number" ? x : x?.id
      ).filter(Boolean);
      for (const id of arr) allIds.add(id);
      return { outfitId: r.id, likes: Number(r.likes || 0), itemIds: arr };
    });

    let idToItem = new Map();
    if (allIds.size) {
      const ids = Array.from(allIds);
      const placeholders = ids.map(() => "?").join(",");
      const rows = await q(
        `SELECT id, category, brand, size, color, image_url
         FROM closet_items
         WHERE id IN (${placeholders})`,
        ids
      );
      idToItem = new Map(rows.map((it) => [it.id, it]));
    }

    const result = parsed.map((p) => ({
      id: p.outfitId,
      items: p.itemIds.map((id) => idToItem.get(id)).filter(Boolean),
      likes: p.likes,
      favorited: true,
    }));

    res.json(result);
  } catch (e) {
    console.error("GET /favorites", e);
    res.status(500).json({ error: "favorites-list-failed" });
  }
});

export default router;
