// src/services/ai.js
import { q } from "../db.js";

/* ------------ category groupings in your closet ------------ */
const TOPS     = ["Shirts", "T-shirts", "Sweaters", "Hoodie"];
const BOTTOMS  = ["Pants", "Shorts"];
const JACKET   = "Jackets";
const SHOES    = "Shoes";
const DRESS    = "Dresses";

/* ------------ intent keywords → scores ----------------------
   Each keyword adds weight to the corresponding intent.
   You can tweak weights easily without changing code elsewhere.
----------------------------------------------------------------*/
const INTENTS = ["casual", "work", "workout", "going_out"];

const INTENT_WEIGHTS = {
  casual: [
    ["casual", 2], ["cozy", 2], ["chill", 1], ["basic", 1],
    ["everyday", 2], ["denim", 1], ["tee", 1], ["t-shirt", 1],
    ["streetwear", 1], ["neutral", 1]
  ],
  work: [
    ["work", 2], ["business", 2], ["business_casual", 2], ["office", 2],
    ["buttondown", 2], ["oxford", 1], ["blazer", 2], ["slacks", 2],
    ["pencil", 1], ["dress_shirt", 2], ["formal", 1]
  ],
  workout: [
    ["workout", 3], ["athleisure", 3], ["gym", 2], ["running", 2],
    ["yoga", 2], ["training", 2], ["sweat", 1], ["performance", 1],
    ["dri-fit", 1], ["leggings", 2], ["sports bra", 2], ["sneakers", 1]
  ],
  going_out: [
    ["going_out", 3], ["party", 3], ["night_out", 3], ["date_night", 3],
    ["club", 2], ["dressy", 2], ["leather", 1], ["sparkle", 2],
    ["silk", 1], ["satin", 1], ["heels", 2], ["mini", 1]
  ],
};

/* ------------ helpers -------------------------------------- */
function parseTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(t => String(t).toLowerCase().trim()).filter(Boolean);
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map(t => String(t).toLowerCase().trim()).filter(Boolean);
  } catch (_) {}
  // comma/space separated fallback
  return String(raw)
    .split(/[,\|]/g)
    .map(t => t.toLowerCase().trim())
    .filter(Boolean);
}

function scoreTags(tags = []) {
  const tset = new Set(tags.map(String));
  const scores = { casual: 0, work: 0, workout: 0, going_out: 0 };

  for (const intent of INTENTS) {
    for (const [kw, w] of INTENT_WEIGHTS[intent]) {
      // exact hit
      if (tset.has(kw)) { scores[intent] += w; continue; }
      // partial match (e.g., "button-down" vs "buttondown")
      for (const t of tset) {
        if (t.includes(kw)) { scores[intent] += Math.max(1, Math.floor(w / 2)); break; }
      }
    }
  }
  return scores;
}

function scoreOutfitIntent(items, occasion /* may be "" */) {
  const total = { casual: 0, work: 0, workout: 0, going_out: 0 };
  for (const it of items) {
    const s = scoreTags(it.tags || []);
    for (const k of INTENTS) total[k] += s[k];
  }
  if (occasion && total[occasion] != null) return total[occasion];
  return total;
}

/* Weather heuristics */
function weatherAccepts(category, tempF) {
  if (category === "Shorts")  return tempF >= 65;
  if (category === "Sweaters" || category === "Hoodie" || category === "Jackets") {
    return tempF <= 72; // still ok in chilly weather
  }
  return true;
}

/* Pick n unique random elements (or fewer if not enough) */
function sample(arr, n) {
  if (!Array.isArray(arr) || !arr.length) return [];
  const copy = arr.slice();
  const out = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

/* -----------------------------------------------------------
   Main: generate outfits ranked by intent score
----------------------------------------------------------- */
export async function generateOutfitsForUser(userId, {
  tempF = 65,
  limit = 12,
  occasion = "", // "", "casual", "work", "workout", "going_out"
} = {}) {
  // load clean items for the user
  const rows = await q(
    `SELECT id, category, brand, color, size, status, image_url, tags
       FROM closet_items
      WHERE user_id = ? AND (status IS NULL OR status = 'Clean')`,
    [userId]
  );

  // normalize tags and filter by weather
  const items = rows
    .map(r => ({
      ...r,
      tags: parseTags(r.tags),
    }))
    .filter(it => weatherAccepts(it.category, tempF));

  // buckets
  const tops    = items.filter(i => TOPS.includes(i.category));
  const bottoms = items.filter(i => BOTTOMS.includes(i.category));
  const jackets = items.filter(i => i.category === JACKET);
  const dresses = items.filter(i => i.category === DRESS);
  const shoes   = items.filter(i => i.category === SHOES);

  const candidates = [];

  // Compose: top + bottom (+ jacket) + shoes
  const topPool    = sample(tops,    Math.min(14, tops.length));
  const bottomPool = sample(bottoms, Math.min(14, bottoms.length));
  const jacketPool = sample(jackets, Math.min(8,  jackets.length));
  const shoePool   = sample(shoes,   Math.min(10, shoes.length));

  for (const t of topPool) {
    for (const b of bottomPool) {
      const s = shoePool[Math.floor(Math.random() * Math.max(1, shoePool.length))];
      if (!s) continue;

      // try with jacket
      if (jacketPool.length) {
        const j = jacketPool[Math.floor(Math.random() * jacketPool.length)];
        const itms = [t, b, j, s];
        const sc = scoreOutfitIntent(itms, occasion);
        candidates.push({ items: itms, score: sc });
      }

      // and without jacket
      const itms2 = [t, b, s];
      const sc2 = scoreOutfitIntent(itms2, occasion);
      candidates.push({ items: itms2, score: sc2 });

      if (candidates.length > 800) break;
    }
    if (candidates.length > 800) break;
  }

  // Compose: dress (+ jacket) + shoes
  for (const d of dresses) {
    const s = shoePool[Math.floor(Math.random() * Math.max(1, shoePool.length))];
    if (!s) continue;

    // with jacket
    if (jacketPool.length) {
      const j = jacketPool[Math.floor(Math.random() * jacketPool.length)];
      const itms = [d, j, s];
      const sc = scoreOutfitIntent(itms, occasion);
      candidates.push({ items: itms, score: sc });
    }
    // without jacket
    const itms2 = [d, s];
    const sc2 = scoreOutfitIntent(itms2, occasion);
    candidates.push({ items: itms2, score: sc2 });
  }

  // If an occasion was specified, heavily prefer higher-scoring fits.
  // Otherwise, we still sort by total score (balanced across intents).
  candidates.sort((a, b) => b.score - a.score);

  const sliced = candidates.slice(0, Math.max(1, limit));
  return sliced.map(c => ({
    id: null,               // no DB row yet for a generated outfit
    items: c.items,
    tempF,
    occasion,
    score: c.score,         // helpful for debugging/UX if needed
  }));
}
