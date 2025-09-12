// backend/src/routes/outfits.js
import express from 'express';
import { authRequired, jwtSecret } from '../auth.js';
import { generateOutfitsForUser } from '../services/ai.js';

const r = express.Router();

r.get('/generate', authRequired(jwtSecret), async (req, res) => {
  try {
    const count = Math.max(1, Math.min(parseInt(req.query.count || '9', 10), 24));
    const qTemp = Number(req.query.tempF);
    const tempF = Number.isFinite(qTemp) ? qTemp : 65;
    const occasion = String(req.query.occasion || 'everyday').toLowerCase();

    const outfits = await generateOutfitsForUser(req.user.id, { tempF, occasion, count });
    // Always 200: empty array when the closet doesn't have enough pieces
    return res.json(outfits);
  } catch (e) {
    console.error('GET /outfits/generate error:', e);
    return res.status(500).json({ error: 'generator-failed' });
  }
});

export default r;
