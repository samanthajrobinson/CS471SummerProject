// backend/src/routes/items.js
import { Router } from "express";
import path from "path";
import fs from "fs/promises";

import { query as q, execute as x, isSqlite } from "../db.js";
import { authRequired, jwtSecret } from "../auth.js";
import { upload, maybeRemoveBg } from "../upload.js";

const router = Router();

const VALID_STATUS = new Set(["Clean", "Laundry"]);

const cleanStr = (v) => (typeof v === "string" ? v.trim() : v ?? null);
const normStatus = (v) => {
  const s = cleanStr(v) || "Clean";
  return VALID_STATUS.has(s) ? s : "Clean";
};
const toRelUploads = (abs) => `uploads/${path.basename(abs)}`.replace(/\\/g, "/");
const rm = async (p) => { try { await fs.unlink(p); } catch {} };
const IGNORE = (mysql, sqlite, params) => x(isSqlite ? sqlite : mysql, params);

/* Convert CSV -> array; array/string -> array of trimmed tags */
function parseTags(input) {
  if (Array.isArray(input)) return input.map((t) => `${t}`.trim()).filter(Boolean);
  if (typeof input === "string") {
    return input
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

/* ---------- GET /items  (supports ?category=&status=) ---------- */
router.get("/", authRequired(jwtSecret), async (req, res) => {
  try {
    const userId = req.user.id;
    const category = cleanStr(req.query.category);
    const status = cleanStr(req.query.status);

    const params = [userId];
    let sql = `
      SELECT
        i.id, i.user_id, i.category, i.status,
        i.brand, i.size, i.color, i.image_url,
        COALESCE(GROUP_CONCAT(t.tag ORDER BY t.tag SEPARATOR ','), '') AS tags_csv
      FROM closet_items i
      LEFT JOIN item_tags t ON t.item_id = i.id
      WHERE i.user_id = ?
    `;

    if (category && category !== "All") {
      sql += " AND i.category = ?";
      params.push(category);
    }
    if (status) {
      sql += " AND i.status = ?";
      params.push(status);
    }

    sql += " GROUP BY i.id ORDER BY i.id DESC";

    const rows = await q(sql, params);

    const items = rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      category: r.category,
      status: r.status,
      brand: r.brand,
      size: r.size,
      color: r.color,
      image_url: r.image_url,
      // expose both string and array to keep old/new UIs happy
      tags: r.tags_csv || "",
      tags_array: (r.tags_csv ? r.tags_csv.split(",").filter(Boolean) : []),
    }));

    res.json(items);
  } catch (e) {
    console.error("GET /items", e);
    res.status(500).json({ error: "items-list-failed" });
  }
});

/* ---------- GET /items/:id ---------- */
router.get("/:id", authRequired(jwtSecret), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "bad-id" });

    const [row] = await q(
      `
      SELECT
        i.id, i.user_id, i.category, i.status,
        i.brand, i.size, i.color, i.image_url,
        COALESCE(GROUP_CONCAT(t.tag ORDER BY t.tag SEPARATOR ','), '') AS tags_csv
      FROM closet_items i
      LEFT JOIN item_tags t ON t.item_id = i.id
      WHERE i.id = ? AND i.user_id = ?
      GROUP BY i.id
      `,
      [id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: "not-found" });

    res.json({
      ...row,
      tags: row.tags_csv || "",
      tags_array: (row.tags_csv ? row.tags_csv.split(",").filter(Boolean) : []),
    });
  } catch (e) {
    console.error("GET /items/:id", e);
    res.status(500).json({ error: "item-get-failed" });
  }
});

/* ---------- POST /items (create) ---------- */
router.post(
  "/",
  authRequired(jwtSecret),
  upload.single("photo"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const category = cleanStr(req.body.category);
      const brand = cleanStr(req.body.brand);
      const size = cleanStr(req.body.size);
      const color = cleanStr(req.body.color);
      const status = normStatus(req.body.status);
      const tagsArr = parseTags(req.body.tags);

      if (!category) return res.status(400).json({ error: "category-required" });
      if (!req.file) return res.status(400).json({ error: "photo-required" });

      // optional background removal
      let filePath = req.file.path;
      try {
        const processed = await maybeRemoveBg(filePath);
        if (processed && processed !== filePath) {
          await rm(filePath);
          filePath = processed;
        }
      } catch (e) {
        console.warn("remove.bg failed, keeping original:", e?.message || e);
      }
      const image_url = toRelUploads(filePath);

      const ins = await x(
        `INSERT INTO closet_items (user_id, category, brand, size, color, status, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, category, brand, size, color, status, image_url]
      );
      const newId = isSqlite ? ins.lastInsertRowid : ins.insertId;

      // save tags in item_tags (schema-agnostic: use only item_id,tag)
      if (tagsArr.length) {
        for (const t of tagsArr) {
          await IGNORE(
            `INSERT IGNORE INTO item_tags (item_id, tag) VALUES (?, ?)`,
            `INSERT OR IGNORE INTO item_tags (item_id, tag) VALUES (?, ?)`,
            [newId, t]
          );
        }
      }

      const [row] = await q(
        `
        SELECT i.id, i.user_id, i.category, i.status, i.brand, i.size, i.color, i.image_url,
               COALESCE(GROUP_CONCAT(t.tag ORDER BY t.tag SEPARATOR ','), '') AS tags_csv
        FROM closet_items i
        LEFT JOIN item_tags t ON t.item_id = i.id
        WHERE i.id = ?
        GROUP BY i.id
        `,
        [newId]
      );

      res.status(201).json({
        ...row,
        tags: row.tags_csv || "",
        tags_array: (row.tags_csv ? row.tags_csv.split(",").filter(Boolean) : []),
      });
    } catch (e) {
      console.error("POST /items", e);
      res.status(500).json({ error: "item-create-failed" });
    }
  }
);

/* ---------- PATCH /items/:id (edit) ---------- */
router.patch(
  "/:id",
  authRequired(jwtSecret),
  upload.single("photo"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "bad-id" });

      const [existing] = await q(
        `SELECT id, image_url FROM closet_items WHERE id = ? AND user_id = ?`,
        [id, req.user.id]
      );
      if (!existing) return res.status(404).json({ error: "not-found" });

      const fields = {
        category: cleanStr(req.body.category),
        brand: cleanStr(req.body.brand),
        size: cleanStr(req.body.size),
        color: cleanStr(req.body.color),
        status: req.body.status ? normStatus(req.body.status) : undefined,
      };

      const set = [];
      const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }

      // optional new photo
      if (req.file) {
        let filePath = req.file.path;
        try {
          const processed = await maybeRemoveBg(filePath);
          if (processed && processed !== filePath) {
            await rm(filePath);
            filePath = processed;
          }
        } catch (e) {
          console.warn("remove.bg failed, keeping original:", e?.message || e);
        }
        const image_url = toRelUploads(filePath);
        set.push("image_url = ?");
        vals.push(image_url);

        // delete old image if replaced
        if (existing.image_url) {
          await rm(path.join(process.cwd(), existing.image_url));
        }
      }

      if (set.length) {
        vals.push(id, req.user.id);
        await x(
          `UPDATE closet_items SET ${set.join(", ")} WHERE id = ? AND user_id = ?`,
          vals
        );
      }

      // update tags only if client provided them
      if (Object.prototype.hasOwnProperty.call(req.body, "tags")) {
        const tagsArr = parseTags(req.body.tags);
        await x(`DELETE FROM item_tags WHERE item_id = ?`, [id]);
        for (const t of tagsArr) {
          await IGNORE(
            `INSERT IGNORE INTO item_tags (item_id, tag) VALUES (?, ?)`,
            `INSERT OR IGNORE INTO item_tags (item_id, tag) VALUES (?, ?)`,
            [id, t]
          );
        }
      }

      const [row] = await q(
        `
        SELECT i.id, i.user_id, i.category, i.status, i.brand, i.size, i.color, i.image_url,
               COALESCE(GROUP_CONCAT(t.tag ORDER BY t.tag SEPARATOR ','), '') AS tags_csv
        FROM closet_items i
        LEFT JOIN item_tags t ON t.item_id = i.id
        WHERE i.id = ?
        GROUP BY i.id
        `,
        [id]
      );

      res.json({
        ...row,
        tags: row.tags_csv || "",
        tags_array: (row.tags_csv ? row.tags_csv.split(",").filter(Boolean) : []),
      });
    } catch (e) {
      console.error("PATCH /items/:id", e);
      res.status(500).json({ error: "item-update-failed" });
    }
  }
);

/* ---------- PATCH /items/batch (multi move to Laundry/Clean) ---------- */
router.patch("/batch", authRequired(jwtSecret), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    const status = normStatus(req.body?.status);
    if (!ids.length) return res.status(400).json({ error: "ids-required" });

    const placeholders = ids.map(() => "?").join(",");
    await x(
      `UPDATE closet_items SET status = ? WHERE user_id = ? AND id IN (${placeholders})`,
      [status, req.user.id, ...ids]
    );

    res.json({ ok: true, updated: ids.length, status });
  } catch (e) {
    console.error("PATCH /items/batch", e);
    res.status(500).json({ error: "items-batch-failed" });
  }
});

/* ---------- DELETE /items/:id ---------- */
router.delete("/:id", authRequired(jwtSecret), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "bad-id" });

    const [existing] = await q(
      `SELECT id, image_url FROM closet_items WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: "not-found" });

    await x(`DELETE FROM closet_items WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    await x(`DELETE FROM item_tags WHERE item_id = ?`, [id]);

    if (existing.image_url) {
      await rm(path.join(process.cwd(), existing.image_url));
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /items/:id", e);
    res.status(500).json({ error: "item-delete-failed" });
  }
});

export default router;
