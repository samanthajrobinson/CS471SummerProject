// backend/src/services/ai.js
import { query as q, isSqlite } from "../db.js";

/* ------------ taxonomy (for scoring) ------------ */
const TOPS    = ["Shirts", "T-shirts", "Sweaters", "Hoodie"];
const BOTTOMS = ["Pants", "Shorts"];
const JACKET  = "Jackets";
const SHOES   = "Shoes";
const DRESS   = "Dresses";
const ACCESS  = "Accessories";

const NEUTRALS = new Set(["black","white","gray","grey","navy","tan","beige","cream","khaki","denim"]);
const WARMTH = { // nudges for temperature fit
  "warmth:summer": +3, "warmth:transitional": +1,
  "warmth:winter": -2, "warmth:insulated": -3,
};

/* ------------ settings ------------ */
const TEMP_SHORTS_MIN   = 65;
const TEMP_JACKET_MAX   = 60;
const TEMP_VERY_COLD    = 50;
const DRESS_JACKET_RATE = 0.2;

const CAP = { TOP:2, BOTTOM:2, SHOE:2, JACKET:2, DRESS:2, ACC:2 };

const TAGS_AGG = isSqlite
  ? `GROUP_CONCAT(t.tag, ',')`
  : `GROUP_CONCAT(t.tag ORDER BY t.tag SEPARATOR ',')`;

/* ------------ helpers ------------ */
const parseCsv = (csv) =>
  !csv ? [] : String(csv).split(",").map(s=>s.trim()).filter(Boolean);

function toTagMap(tagsArray) {
  const map = new Map();
  for (const raw of (tagsArray||[])) {
    const i = String(raw).indexOf(":");
    const ns = i>0 ? raw.slice(0,i).toLowerCase() : "misc";
    const val = i>0 ? raw.slice(i+1).toLowerCase() : raw.toLowerCase();
    if (!map.has(ns)) map.set(ns, new Set());
    map.get(ns).add(val);
  }
  return map;
}
const has = (m, ns, val) => m.get(ns)?.has(val.toLowerCase()) ?? false;

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];}return a;}
const baseKeyDress = (d,s) => `D:${d}|S:${s}`;
const baseKeySet   = (t,b,s) => `T:${t}|B:${b}|S:${s}`;
const exactKey     = (arr) => arr.map(x=>x?.id).filter(Boolean).sort((a,b)=>a-b).join("-");

const colorToks = s => !s ? [] : String(s).toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
function colorScore(items) {
  const pal = items.map(i=>colorToks(i.color));
  let s = 0;
  for (let i=0;i<pal.length;i++){
    for (let j=i+1;j<pal.length;j++){
      const A = new Set(pal[i]); const B = new Set(pal[j]);
      for (const t of A) if (B.has(t)) s += (NEUTRALS.has(t) ? 0.5 : 1.5);
      for (const t of A) if (NEUTRALS.has(t)) s += 0.25;
      for (const t of B) if (NEUTRALS.has(t)) s += 0.25;
    }
  }
  return Math.min(s, 6);
}

/* per-item weather/occasion scoring from namespaced tags */
function itemScore(item, tempF, occasion) {
  let s = 0;
  const tagsMap = toTagMap(item.tags_array);

  // occasion fit
  const wanted = {
    "": ["everyday","casual","streetwear","basic"],
    casual: ["casual","streetwear","basic","denim"],
    work: ["work","office","business","buttondown","slacks","blazer","oxford"],
    workout: ["workout","athletic","gym","running","training","sport"],
    "going out": ["party","night","club","date","dressy","heels"],
  }[occasion||""] || [];
  for (const w of wanted) if (has(tagsMap, "occasion", w) || has(tagsMap, "style", w)) s += 2;

  // warmth / material nudges
  for (const key in WARMTH) if (has(tagsMap, ...key.split(":"))) s += WARMTH[key];

  if (has(tagsMap,"material","linen") && tempF>=72) s += 2;
  if (has(tagsMap,"material","wool")  && tempF<=55) s += 2;

  // shorts penalty in cold
  if (item.category==="Shorts" && tempF<TEMP_SHORTS_MIN) s -= 4;

  // shoes: discourage sandals in cold; boost boots when cool
  if (item.category===SHOES) {
    if (tempF < 60 && (has(tagsMap,"footwear","sandal")||has(tagsMap,"footwear","open-toe"))) s -= 2;
    if (tempF <= TEMP_JACKET_MAX && has(tagsMap,"footwear","boot")) s += 1;
  }

  // fit/compatibility basic nudge
  if (has(tagsMap,"fit","relaxed") && occasion==="work") s -= 1;
  if (has(tagsMap,"fit","tailored") && (occasion==="work"||occasion==="going out")) s += 1;

  return s;
}

function setCompatScore(items, occasion) {
  let s = colorScore(items);
  const all = new Set(items.flatMap(i=>i.tags_array||[]));
  if (occasion==="work" && (all.has("style:distressed") || all.has("style:sport"))) s -= 1;
  if (occasion==="workout" && (all.has("activity:running") || all.has("activity:training") || all.has("style:athletic"))) s += 2;
  return s;
}

const allowByTemp = (cat, t) => (cat==="Shorts" ? t>=TEMP_SHORTS_MIN : true);

/* ------------ main generator ------------ */
export async function generateOutfitsForUser(
  userId,
  { tempF = 65, occasion = "", limit = 12 } = {}
) {
  const rows = await q(
    `
    SELECT
      i.id, i.user_id, i.category, i.status,
      i.brand, i.size, i.color, i.image_url,
      COALESCE(${TAGS_AGG}, '') AS tags_csv
    FROM closet_items i
    LEFT JOIN item_tags t ON t.item_id = i.id
    WHERE i.user_id = ?
      AND (i.status IS NULL OR i.status <> 'Laundry')
    GROUP BY i.id
    ORDER BY i.id DESC
    `,
    [userId]
  );

  const items = rows
    .map(r => ({ ...r, tags_array: parseCsv(r.tags_csv) }))
    .filter(it => allowByTemp(it.category, tempF));

  const tops     = items.filter(i => TOPS.includes(i.category));
  const bottomsA = items.filter(i => BOTTOMS.includes(i.category));
  const dresses  = items.filter(i => i.category===DRESS || i.category==="Dress");
  const jackets  = items.filter(i => i.category===JACKET || i.category==="Jacket");
  const shoes    = items.filter(i => i.category===SHOES);
  const accs     = items.filter(i => i.category===ACCESS);

  const bottoms = tempF < TEMP_SHORTS_MIN
    ? bottomsA.filter(b=>b.category!=="Shorts")
    : bottomsA;

  if (!shoes.length || (!dresses.length && (!tops.length || !bottoms.length))) return [];

  shuffle(tops); shuffle(bottoms); shuffle(dresses);
  shuffle(jackets); shuffle(shoes); shuffle(accs);

  const seenBase = new Set(), seenExact = new Set(), useCount = new Map();
  const canUse = (it)=>{
    const cap =
      it.category===SHOES?CAP.SHOE:
      it.category===JACKET?CAP.JACKET:
      it.category===DRESS?CAP.DRESS:
      TOPS.includes(it.category)?CAP.TOP:
      BOTTOMS.includes(it.category)?CAP.BOTTOM:
      CAP.ACC;
    return (useCount.get(it.id)||0) < cap;
  };
  const markUsed = (arr)=>{ for(const it of arr) useCount.set(it.id,(useCount.get(it.id)||0)+1); };

  const out = [];
  const pushScored = (arr, baseKey) => {
    const eKey = exactKey(arr);
    if (!eKey || seenBase.has(baseKey) || seenExact.has(eKey)) return false;

    let score = setCompatScore(arr, occasion);
    for (const it of arr) score += itemScore(it, tempF, occasion);

    seenBase.add(baseKey); seenExact.add(eKey);
    out.push({ id:null, items:arr, tempF, occasion, favorited:false, score });
    markUsed(arr);
    return true;
  };

  // Dresses: prefer no jacket; only add jacket when very cold and rarely
  let shoeIdx = 0;
  for (const d of dresses) {
    if (!canUse(d)) continue;
    const s = shoes[shoeIdx++ % shoes.length]; if (!s || !canUse(s)) continue;
    const base = baseKeyDress(d.id, s.id);

    if (accs.length && Math.random()<0.5) {
      const a = accs[(d.id+s.id)%accs.length];
      if (a && canUse(a) && pushScored([d,a,s], base) && out.length>=limit) break;
    }
    if (pushScored([d,s], base) && out.length>=limit) break;

    if (tempF<=TEMP_VERY_COLD && Math.random()<DRESS_JACKET_RATE && jackets.length) {
      const j = jackets[(d.id+s.id)%jackets.length];
      if (j && canUse(j) && pushScored([d,j,s], base) && out.length>=limit) break;
    }
  }

  // Tops + Bottoms (+ jacket/accessory)
  const wantJacket = tempF <= TEMP_JACKET_MAX;
  const jacketRate = wantJacket ? 0.55 : 0.15;
  const accRate    = 0.35;

  outer:
  for (const t of tops) {
    if (!canUse(t)) continue;
    for (const b of bottoms) {
      if (!canUse(b)) continue;
      const s = shoes[shoeIdx++ % shoes.length]; if (!s || !canUse(s)) continue;

      const base = baseKeySet(t.id,b.id,s.id);

      if (jackets.length && Math.random()<jacketRate) {
        const j = jackets[(t.id+b.id+s.id)%jackets.length];
        if (j && canUse(j) && pushScored([t,j,b,s], base) && out.length>=limit) break outer;
      }
      if (accs.length && Math.random()<accRate) {
        const a = accs[(t.id+b.id+s.id)%accs.length];
        if (a && canUse(a) && pushScored([t,b,s,a], base) && out.length>=limit) break outer;
      }
      if (pushScored([t,b,s], base) && out.length>=limit) break outer;
    }
  }

  out.sort((a,b)=>b.score-a.score);
  return out.slice(0, limit).map(({score, ...rest})=>rest);
}

export default { generateOutfitsForUser };
