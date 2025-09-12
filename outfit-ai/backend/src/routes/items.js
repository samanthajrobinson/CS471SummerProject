// backend/src/routes/items.js
import express from "express";
import path from "path";
import { authRequired, jwtSecret } from "../auth.js";
import * as DB from "../db.js";
import { upload, maybeRemoveBg, filePathToUrl } from "../upload.js";

const router = express.Router();

// --- DB helpers (MySQL or SQLite) -------------------------------------------
const isSqlite = !!(DB.db && typeof DB.db.prepare === "function");

const q = async (sql, params = []) =>
  isSqlite ? DB.db.prepare(sql).all(...params) : (await DB.pool.query(sql, params))[0];

const x = async (sql, params = []) =>
  isSqlite ? DB.db.prepare(sql).run(...params) : (await DB.pool.execute(sql, params))[0];

// --- utils -------------------------------------------------------------------
const normStatus = (s) => (/laundry/i.test(String(s)) ? "Laundry" : "Clean");

function parseTags(raw) {
  if (Array.isArray(raw)) {
    return raw.map(String).map((t) => t.trim().toLowerCase()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    // accept JSON array or comma-separated
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.map(String).map((t) => t.trim().toLowerCase()).filter(Boolean);
      }
    } catch {
      return raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return [];
}

async function replaceTags(itemId, tags) {
  await x(`DELETE FROM item_tags WHERE item_id = ?`, [itemId]);
  for (const t of tags) {
    if (isSqlite) {
      await x(`INSERT OR IGNORE INTO item_tags (item_id, tag) VALUES (?,?)`, [itemId, t]);
    } else {
      await x(`INSERT IGNORE INTO item_tags (item_id, tag) VALUES (?,?)`, [itemId, t]);
    }
  }
}

// --- Routes ------------------------------------------------------------------

/**
 * GET /items
 * Query params:
 *  - category=Shirts|Pants|...|All
 *  - status=Clean|Laundry
 *  - ids=1,2,3 (optional exact subset)
 */
router.get("/", authRequired(jwtSecret), async (req, res) => {
  try {
    const { category, status, ids } = req.query;
    const where = ["user_id = ?"];
    const params = [req.user.id];

    if (ids) {
      const idList = String(ids)
        .split(",")
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!idList.length) return res.json([]);
      where.push(`id IN (${idList.map(() => "?").join(",")})`);
      params.push(...idList);
    } else {
      if (category && String(category).toLowerCase() !== "all") {
        where.push("category = ?");
        params.push(String(category));
      }
      if (status && /^(clean|laundry)$/i.test(String(status))) {
        where.push("status = ?");
        params.push(normStatus(status));
      }
    }

    const rows = await q(
      `SELECT id, user_id, category, brand, color, size, status, image_url
         FROM closet_items
        WHERE ${where.join(" AND ")}
        ORDER BY id DESC`,
      params
    );

    res.json(rows);
  } catch (e) {
    console.error("GET /items", e);
    res.status(500).json({ error: "items-list-failed", detail: e.message });
  }
});

/**
 * GET /items/:id
 */
router.get("/:id", authRequired(jwtSecret), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await q(
      `SELECT id, user_id, category, brand, color, size, status, image_url
         FROM closet_items
        WHERE id=? AND user_id=?`,
      [id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: "not-found" });

    // tags
    const tags = await q(`SELECT tag FROM item_tags WHERE item_id=? ORDER BY tag ASC`, [id]);
    row.tags = tags.map((t) => t.tag);

    res.json(row);
  } catch (e) {
    console.error("GET /items/:id", e);
    res.status(500).json({ error: "item-load-failed", detail: e.message });
  }
});

/**
 * POST /items
 * multipart/form-data with field "photo"
 * optional: category, status, brand, color, size, tags (array|JSON|CSV)
 */
router.post("/", authRequired(jwtSecret), upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "photo required", detail: "multipart field must be 'photo'" });
    }

    // Try background removal
    const noBg = await maybeRemoveBg(req.file.path);
    const finalAbs = noBg || req.file.path;
    const imageUrl = filePathToUrl(finalAbs); // => /uploads/name.png

    const b = req.body || {};
    const category = String(b.category || "Shirts");
    const status = normStatus(b.status);
    const brand = b.brand != null ? String(b.brand) : "";
    const color = b.color != null ? String(b.color) : "";
    const size = b.size != null ? String(b.size) : "";

    const tags = parseTags(b.tags);

    const ins = await x(
      `INSERT INTO closet_items (user_id, category, status, brand, color, size, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, category, status, brand, color, size, imageUrl]
    );
    const itemId = ins.insertId ?? ins.lastInsertRowid;

    if (tags.length) await replaceTags(itemId, tags);

    const [row] = await q(
      `SELECT id, user_id, category, brand, color, size, status, image_url
         FROM closet_items WHERE id=?`,
      [itemId]
    );

    res.status(201).json(row || { id: itemId, category, brand, color, size, status, image_url: imageUrl });
  } catch (e) {
    console.error("POST /items failed:", e);
    res.status(500).json({ error: "item-create-failed", detail: e.sqlMessage || e.message });
  }
});

/**
 * PATCH /items/:id
 * JSON body: any subset of { category, brand, color, size, status, tags }
 * - tags can be array / JSON string / CSV
 * - replaces entire tag set if provided
 */
router.patch("/:id", authRequired(jwtSecret), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};

    // Only update provided fields
    const sets = [];
    const params = [];

    if (b.category != null) {
      sets.push("category = ?");
      params.push(String(b.category));
    }
    if (b.brand != null) {
      sets.push("brand = ?");
      params.push(String(b.brand));
    }
    if (b.color != null) {
      sets.push("color = ?");
      params.push(String(b.color));
    }
    if (b.size != null) {
      sets.push("size = ?");
      params.push(String(b.size));
    }
    if (b.status != null) {
      sets.push("status = ?");
      params.push(normStatus(b.status));
    }

    if (sets.length) {
      params.push(id, req.user.id);
      await x(`UPDATE closet_items SET ${sets.join(", ")} WHERE id=? AND user_id=?`, params);
    }

    if (b.tags != null) {
      const tags = parseTags(b.tags);
      await replaceTags(id, tags);
    }

    const [row] = await q(
      `SELECT id, user_id, category, brand, color, size, status, image_url
         FROM closet_items WHERE id=? AND user_id=?`,
      [id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: "not-found" });
    const tagRows = await q(`SELECT tag FROM item_tags WHERE item_id=? ORDER BY tag ASC`, [id]);
    row.tags = tagRows.map((t) => t.tag);

    res.json(row);
  } catch (e) {
    console.error("PATCH /items/:id", e);
    res.status(500).json({ error: "item-update-failed", detail: e.sqlMessage || e.message });
  }
});

/**
 * PATCH /items/:id/photo
 * multipart/form-data { photo }
 */
router.patch("/:id/photo", authRequired(jwtSecret), upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "photo required" });

    const id = Number(req.params.id);
    const noBg = await maybeRemoveBg(req.file.path);
    const finalAbs = noBg || req.file.path;
    const imageUrl = filePathToUrl(finalAbs);

    await x(`UPDATE closet_items SET image_url=? WHERE id=? AND user_id=?`, [
      imageUrl,
      id,
      req.user.id,
    ]);

    const [row] = await q(
      `SELECT id, user_id, category, brand, color, size, status, image_url
         FROM closet_items WHERE id=? AND user_id=?`,
      [id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: "not-found" });
    res.json(row);
  } catch (e) {
    console.error("PATCH /items/:id/photo", e);
    res.status(500).json({ error: "photo-update-failed", detail: e.sqlMessage || e.message });
  }
});

/**
 * PATCH /items/:id/status
 * body: { status: "Clean" | "Laundry" }
 */
router.patch("/:id/status", authRequired(jwtSecret), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = normStatus(req.body?.status);
    await x(`UPDATE closet_items SET status=? WHERE id=? AND user_id=?`, [
      status,
      id,
      req.user.id,
    ]);
    res.json({ ok: true, status });
  } catch (e) {
    console.error("PATCH /items/:id/status", e);
    res.status(500).json({ error: "status-update-failed", detail: e.sqlMessage || e.message });
  }
});

/**
 * POST /items/laundry/bulk
 * body: { ids: number[], status: "Clean" | "Laundry" }
 */
router.post("/laundry/bulk", authRequired(jwtSecret), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (!ids.length) return res.status(400).json({ error: "ids required" });

    const status = normStatus(req.body?.status);
    const ph = ids.map(() => "?").join(",");
    await x(
      `UPDATE closet_items SET status=? WHERE user_id=? AND id IN (${ph})`,
      [status, req.user.id, ...ids]
    );
    res.json({ ok: true, count: ids.length, status });
  } catch (e) {
    console.error("POST /items/laundry/bulk", e);
    res.status(500).json({ error: "bulk-update-failed", detail: e.sqlMessage || e.message });
  }
});

/**
 * GET /items/tags
 * Returns distinct tags for the user's closet (for tag dropdown suggestions)
 */
router.get("/tags/all", authRequired(jwtSecret), async (req, res) => {
  try {
    const rows = await q(
      `SELECT DISTINCT it.tag
         FROM item_tags it
         JOIN closet_items ci ON ci.id = it.item_id
        WHERE ci.user_id = ?
        ORDER BY it.tag ASC`,
      [req.user.id]
    );
    res.json(rows.map((r) => r.tag));
  } catch (e) {
    console.error("GET /items/tags/all", e);
    res.status(500).json({ error: "tags-load-failed", detail: e.sqlMessage || e.message });
  }
});

/**
 * DELETE /items/:id
 */
router.delete("/:id", authRequired(jwtSecret), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await x(`DELETE FROM item_tags WHERE item_id=?`, [id]);
    await x(`DELETE FROM closet_items WHERE id=? AND user_id=?`, [id, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /items/:id", e);
    res.status(500).json({ error: "item-delete-failed", detail: e.sqlMessage || e.message });
  }
});

export default router;
