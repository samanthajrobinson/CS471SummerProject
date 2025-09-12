import express from "express";
import * as DB from "../db.js";
import { authRequired, jwtSecret } from "../auth.js";

const router = express.Router();
const isSqlite = !!(DB.db && typeof DB.db.prepare === "function");
const q = async (sql, p=[]) => isSqlite ? DB.db.prepare(sql).all(...p) : (await DB.pool.query(sql, p))[0];
const x = async (sql, p=[]) => isSqlite ? DB.db.prepare(sql).run(...p) : (await DB.pool.execute(sql, p))[0];

async function countLikes(outfitId) {
  const [row] = await q(`SELECT COUNT(*) AS c FROM likes WHERE outfit_id=?`, [outfitId]);
  return Number(row?.c || 0);
}

router.post("/", authRequired(jwtSecret), async (req, res) => {
  try {
    const outfitId = Number(req.body?.outfitId);
    if (!Number.isFinite(outfitId)) return res.status(400).json({ error: "outfitId required" });

    const [exists] = await q(`SELECT id FROM outfits WHERE id=?`, [outfitId]);
    if (!exists) return res.status(404).json({ error: "outfit-not-found" });

    await x(isSqlite
      ? `INSERT OR IGNORE INTO likes (user_id, outfit_id) VALUES (?,?)`
      : `INSERT IGNORE INTO likes (user_id, outfit_id) VALUES (?,?)`,
      [req.user.id, outfitId]
    );

    const likes = await countLikes(outfitId);
    res.status(201).json({ ok: true, outfitId, liked_by_me: true, likes });
  } catch (e) {
    console.error("POST /likes", e);
    res.status(500).json({ error: "like-failed", detail: e.message });
  }
});

router.delete("/:id", authRequired(jwtSecret), async (req, res) => {
  try {
    const outfitId = Number(req.params.id);
    if (!Number.isFinite(outfitId)) return res.status(400).json({ error: "invalid id" });

    await x(`DELETE FROM likes WHERE user_id=? AND outfit_id=?`, [req.user.id, outfitId]);
    const likes = await countLikes(outfitId);
    res.json({ ok: true, outfitId, liked_by_me: false, likes });
  } catch (e) {
    console.error("DELETE /likes/:id", e);
    res.status(500).json({ error: "unlike-failed", detail: e.message });
  }
});

export default router;
