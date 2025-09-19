// backend/src/services/ai.js
import { query as q, isSqlite } from "../db.js";

/* ===== taxonomy ===== */
const TOPS    = ["Shirts", "T-shirts", "Sweaters", "Hoodie"];
const BOTTOMS = ["Pants", "Shorts"];
const JACKET  = "Jackets";
const SHOES   = "Shoes";
const DRESS   = "Dresses";
const ACCESS  = "Accessories";

const NEUTRALS = new Set(["black","white","gray","grey","navy","tan","beige","cream","khaki","denim"]);

// temperature thresholds (only used when NOT workout)
const TEMP_SHORTS_MIN = 65; // allow shorts when >= this
const TEMP_JACKET_MAX = 60; // only add jackets to combos when <= this
const TEMP_VERY_COLD  = 50; // allow dress+jacket when <= this

/* ===== weights (tags dominate) ===== */
const W = {
  OCC_MATCH: 12, ACTIVITY_MATCH: 10, FORMALITY_MATCH: 8,
  FIT_MATCH: 4, MATERIAL_MATCH: 4, WARMTH_TAG: 4,
  FORBID_STRONG: -18, FORBID_SOFT: -8, WEATHER_PEN: -6,
  COLOR_MAX: 6
};

const OCC_RULES = {
  casual: {
    requireAny: ["occasion:casual","style:casual","style:streetwear","style:basic"],
    forbidAll: ["formality:formal", "style:dressy"]
  },
  work: {
    requireAny: ["occasion:work","style:business","formality:business","formality:smart-casual"],
    forbidAll: ["style:athletic","activity:running","activity:training","style:distressed","pattern:graphic","occasion:workout","occasion:going out"]
  },
  workout: {
    requireAny: ["occasion:workout","style:athletic","activity:running","activity:training","activity:gym","footwear:sneaker"],
    forbidAll: ["formality:business","formality:formal","style:dressy","footwear:heel","footwear:oxford","footwear:loafer","occasion:work","occasion:going out"]
  },
  "going out": {
    requireAny: ["occasion:going out","style:dressy","formality:formal","formality:smart-casual"],
    forbidAll: ["style:athletic","activity:running","activity:training","occasion:workout"]
  }
};

const TAGS_AGG = isSqlite
  ? `GROUP_CONCAT(t.tag, ',')`
  : `GROUP_CONCAT(t.tag ORDER BY t.tag SEPARATOR ',')`;

/* ===== randomness / variety controls ===== */
const ITEM_JITTER = 1.0;
const COMBO_JITTER = 1.0;
const SOFTMAX_TEMP = 0.8;
const MAX_RECENT_PER_USER = 100;

// Per-user recent outfits memory (in-process)
const recentByUser = new Map(); // userId -> Set(keys)
function rememberOutfit(userId, key) {
  if (!key) return;
  if (!recentByUser.has(userId)) recentByUser.set(userId, new Set());
  const set = recentByUser.get(userId);
  set.add(key);
  if (set.size > MAX_RECENT_PER_USER) {
    const lastN = Array.from(set).slice(-MAX_RECENT_PER_USER);
    recentByUser.set(userId, new Set(lastN));
  }
}
function seenRecently(userId, key) {
  const set = recentByUser.get(userId);
  return set ? set.has(key) : false;
}

/* ===== utils ===== */
const splitCsv = (csv) => !csv ? [] : String(csv).split(",").map(s=>s.trim()).filter(Boolean);

function toTagMap(tagsArray) {
  const map = new Map();
  for (const raw of (tagsArray || [])) {
    const s = String(raw);
    const i = s.indexOf(":");
    const ns = i > 0 ? s.slice(0, i).toLowerCase() : "misc";
    const val = i > 0 ? s.slice(i + 1).toLowerCase() : s.toLowerCase();
    if (!map.has(ns)) map.set(ns, new Set());
    map.get(ns).add(val);
  }
  return map;
}

function formalityAllowedForOccasion(tagMap, occasion) {
  const fm = tagMap.get("formality") || new Set();
  const has = (v) => fm.has(v);
  if (occasion === "casual") {
    if (has("formal") || has("business")) return false;
  }
  if (occasion === "work" || occasion === "going out") {
    if (has("casual")) return false;
  }
  if (occasion === "workout") {
    if (has("formal") || has("business")) return false;
  }
  return true;
}

const hasTag = (m, ns, val) => m.get(ns)?.has(val.toLowerCase()) ?? false;

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];}return a;}
const exactKey = (arr)=>arr.map(x=>x?.id).filter(Boolean).sort((a,b)=>a-b).join("-");

const toks = s => !s ? [] : String(s).toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
function colorScore(items) {
  const pal = items.map(i=>toks(i.color));
  let s = 0;
  for (let i=0;i<pal.length;i++){
    for (let j=i+1;j<pal.length;j++){
      const A = new Set(pal[i]); const B = new Set(pal[j]);
      for (const t of A) if (B.has(t)) s += (NEUTRALS.has(t) ? 0.5 : 1.5);
      for (const t of A) if (NEUTRALS.has(t)) s += 0.25;
      for (const t of B) if (NEUTRALS.has(t)) s += 0.25;
    }
  }
  return Math.min(s, W.COLOR_MAX);
}

function topN(arr, scoreFn, n) {
  return arr
    .map(it => ({ it, s: scoreFn(it) + (Math.random() - 0.5) * ITEM_JITTER }))
    .sort((a,b)=>b.s-a.s)
    .slice(0, Math.min(n, arr.length))
    .map(x => x.it);
}

/* ===== footwear gating (strict) ===== */
function shoeAllowedForOccasion(tagMap, occasion) {
  const fw   = tagMap.get('footwear') || new Set();
  const sty  = tagMap.get('style')    || new Set();
  const occ  = tagMap.get('occasion') || new Set();
  const act  = tagMap.get('activity') || new Set();
  const excl = tagMap.get('exclusive')|| new Set();
  const ex   = tagMap.get('exclude')  || new Set();
  const allow= tagMap.get('allow')    || new Set();

  // Hard exclusives (e.g., exclusive:workout)
  if (excl.size > 0) {
    let ok = false;
    for (const v of excl) if (v === occasion) { ok = true; break; }
    if (!ok) return false;
  }

  // Per-occasion explicit exclude (e.g., exclude:casual)
  if (ex.has(occasion)) return false;

  // Workout: sneakers (athletic) only
  const isAthleticSneaker =
    fw.has('sneaker') && (sty.has('athletic') || occ.has('workout') || (act.size > 0));
  if (occasion === 'workout') return isAthleticSneaker;

  // Hide athletic sneakers from non-workout outfits by default
  if (isAthleticSneaker) return false;

  // Work: no sneakers/sandals; dress shoes OK (heel allowed for work unless excluded)
  if (occasion === 'work') {
    if (fw.has('sneaker') || fw.has('sandal')) return false;
    return fw.has('oxford') || fw.has('loafer') || fw.has('flat') || fw.has('boot') || fw.has('heel');
  }

  // Going out: allow heels; sneakers only if dressy or flagged for going out
  if (occasion === 'going out') {
    if (fw.has('sneaker')) return sty.has('dressy') || occ.has('going out');
    return true;
  }

  // Casual: disallow heels unless explicitly allowed
  if (occasion === 'casual') {
    if (fw.has('heel')) return (allow.has('casual') || occ.has('casual'));
    return true;
  }

  // Default (any occasion)
  return true;
}

function isWorkoutTagged(m) {
  const occ  = m.get('occasion')  || new Set();
  const excl = m.get('exclusive') || new Set();
  return occ.has('workout') || excl.has('workout');
}

function isAthleticSneakerMap(m) {
  const fw  = m.get('footwear') || new Set();
  const sty = m.get('style')    || new Set();
  const occ = m.get('occasion') || new Set();
  const act = m.get('activity') || new Set();
  return fw.has('sneaker') && (sty.has('athletic') || occ.has('workout') || act.size > 0);
}

/** relaxed eligibility for workout if inventory is thin */
function isWorkoutEligibleRelaxed(item) {
  const m = toTagMap(item.tags_array);
  if (item.category === 'Shoes') return isAthleticSneakerMap(m); // still athletic sneakers
  // allow items that are explicitly workout OR clearly athletic/active
  if (isWorkoutTagged(m)) return true;
  const sty = m.get('style')    || new Set();
  const act = m.get('activity') || new Set();
  return sty.has('athletic') || act.has('running') || act.has('training') || act.has('gym');
}

function isWorkTagged(m) {
  const occ  = m.get('occasion')  || new Set();
  const excl = m.get('exclusive') || new Set();
  return occ.has('work') || excl.has('work');
}

function isWorkEligibleRelaxed(item) {
  const m = toTagMap(item.tags_array);

  if (item.category === 'Shoes') {
    // Work shoes: no sneakers/sandals; allow oxford/loafer/flat/boot/heel OR dressy/business/formal cues
    const fw   = m.get('footwear') || new Set();
    const sty  = m.get('style')    || new Set();
    const form = m.get('formality')|| new Set();
    if (fw.has('sneaker') || fw.has('sandal')) return false;
    return fw.has('oxford') || fw.has('loafer') || fw.has('flat') || fw.has('boot') || fw.has('heel')
           || sty.has('business') || sty.has('dressy')
           || form.has('business') || form.has('smart-casual') || form.has('formal');
  }

  // Non-shoes: clearly work-appropriate signals
  const occ  = m.get('occasion')  || new Set();
  const sty  = m.get('style')     || new Set();
  const form = m.get('formality') || new Set();
  if (occ.has('work')) return true;
  return sty.has('business')
      || form.has('business')
      || form.has('smart-casual')
      || form.has('formal');
}


/* ===== compatibility & scoring ===== */
function isOccasionCompatible(item, occasion) {
  if (!occasion) return true; // “Any occasion”
  const m = toTagMap(item.tags_array);

  // NEW: require the workout tag for ALL items in workout outfits
  if (occasion === "workout") {
    const occ  = m.get("occasion")  || new Set();
    const excl = m.get("exclusive") || new Set(); // allow exclusive:workout too
    // must have occasion:workout (or exclusive:workout)
    if (!(occ.has("workout") || excl.has("workout"))) return false;
  }

  // Shoes keep the footwear-specific rules
  if (item.category === "Shoes") {
    return shoeAllowedForOccasion(m, occasion);
  }

  // Formality wall & per-occasion forbids (as you already have)
  if (!formalityAllowedForOccasion(m, occasion)) return false;

  const forbid = (OCC_RULES[occasion]?.forbidAll || []).some(tag => {
    const i = tag.indexOf(":"); if (i < 0) return false;
    return hasTag(m, tag.slice(0,i), tag.slice(i+1));
  });
  if (forbid) return false;

  // …(keep your remaining per-occasion checks)…
  return true;
}

function tagScore(item, tempF, occasion, applyWeather) {
  const m = toTagMap(item.tags_array);
  let s = 0;

  const req = OCC_RULES[occasion]?.requireAny || [];
  if (req.some(tag => { const i=tag.indexOf(":"); return hasTag(m, tag.slice(0,i), tag.slice(i+1)); }))
    s += W.OCC_MATCH;

  if (occasion === "workout") {
    if (hasTag(m,"style","athletic")) s += W.ACTIVITY_MATCH;
    if (hasTag(m,"activity","running") || hasTag(m,"activity","training") || hasTag(m,"activity","gym")) s += W.ACTIVITY_MATCH;
    if (hasTag(m,"footwear","sneaker")) s += Math.floor(W.ACTIVITY_MATCH/2);
  }

  if (occasion === "work" || occasion === "going out") {
    if (hasTag(m,"formality","business") || hasTag(m,"formality","formal")) s += W.FORMALITY_MATCH;
    if (hasTag(m,"style","dressy")) s += Math.floor(W.FORMALITY_MATCH/2);
    if (hasTag(m,"fit","tailored")) s += W.FIT_MATCH;
  }

  // Material / warmth tags (disabled in workout)
  if (occasion !== "workout") {
    if (hasTag(m,"material","linen") && tempF >= 72) s += W.MATERIAL_MATCH;
    if (hasTag(m,"material","wool")  && tempF <= 55) s += W.MATERIAL_MATCH;
    if (hasTag(m,"warmth","summer"))        s += W.WARMTH_TAG;
    if (hasTag(m,"warmth","transitional"))  s += Math.floor(W.WARMTH_TAG/2);
    if (hasTag(m,"warmth","insulated"))     s += (tempF <= 45 ? W.WARMTH_TAG : -1);
  }

  // Weather penalties (disabled in workout)
  if (applyWeather) {
    if (item.category === "Shorts" && tempF < TEMP_SHORTS_MIN) s += W.WEATHER_PEN;
    if ((item.category === "Sweaters" || item.category === "Hoodie") && tempF > 72) s += W.WEATHER_PEN;
    if (item.category === SHOES) {
      if (tempF < 60 && (hasTag(m,"footwear","sandal") || hasTag(m,"footwear","open-toe"))) s += W.WEATHER_PEN;
      if (tempF <= TEMP_JACKET_MAX && hasTag(m,"footwear","boot")) s += 1;
    }
  }

  // Strong forbids
  const forb = OCC_RULES[occasion]?.forbidAll || [];
  for (const tag of forb) {
    const i = tag.indexOf(":"); if (i<0) continue;
    if (hasTag(m, tag.slice(0,i), tag.slice(i+1))) s += W.FORBID_STRONG;
  }
  return s;
}

/* ===== extra combo rule checks ===== */
function comboRuleCheck(items, occasion) {
  // Items already filtered by isOccasionCompatible; keep global checks
  const all = new Set(items.flatMap(i=>i.tags_array||[]).map(String));
  if (occasion === "workout") {
    const hits =
      (all.has("style:athletic")?1:0) +
      (all.has("activity:running")||all.has("activity:training")||all.has("activity:gym")?1:0) +
      (all.has("footwear:sneaker")?1:0);
    if (hits < 2) return false;
  }
  if (occasion === "work") {
    const ok = ["formality:business","formality:formal","style:business","fit:tailored","style:dressy","occasion:work"]
      .some(t => all.has(t));
    if (!ok) return false;
  }
  if (occasion === "going out") {
    const ok = ["style:dressy","formality:formal","occasion:going out"].some(t => all.has(t));
    if (!ok) return false;
  }
  return true;
}

/* ===== main ===== */
export async function generateOutfitsForUser(
  userId,
  { tempF = 65, occasion = "", limit = 12 } = {}
) {
  const applyWeather = (occasion !== "workout");

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

  const allRows = rows.map(r => ({ ...r, tags_array: splitCsv(r.tags_csv) }));

  // Build items list under strict/relaxed rules depending on occasion
  const buildItems = (strictMode) => {
    return allRows
      .filter(it => {
        // shorts cold gate only when weather applies
        if (applyWeather && it.category === "Shorts" && tempF < TEMP_SHORTS_MIN) return false;
        return true;
      })
      .filter(it => {
        if (occasion === 'workout') {
          if (strictMode) {
            // STRICT: must be explicitly workout + pass shoe/formality gates
            const m = toTagMap(it.tags_array);
            if (it.category === "Shoes") return shoeAllowedForOccasion(m, 'workout') && isWorkoutTagged(m);
            if (!isWorkoutTagged(m)) return false;
            return isOccasionCompatible(it, 'workout');
          } else {
            // RELAXED: athletic/active cues allowed; still block formal/business
            if (it.category === "Shoes") return isWorkoutEligibleRelaxed(it);
            const ok = isWorkoutEligibleRelaxed(it);
            if (!ok) return false;
            const m = toTagMap(it.tags_array);
            return formalityAllowedForOccasion(m, 'workout');
          }
        }

        if (occasion === 'work') {
          if (strictMode) {
            // STRICT: must be explicitly work + pass shoe/formality gates
            const m = toTagMap(it.tags_array);
            if (!isWorkTagged(m)) return false;
            if (it.category === "Shoes" && !shoeAllowedForOccasion(m, 'work')) return false;
            return isOccasionCompatible(it, 'work');
          } else {
            // RELAXED: business/smart-casual/formal cues; shoe sanity rules
            if (it.category === "Shoes") return isWorkEligibleRelaxed(it);
            const ok = isWorkEligibleRelaxed(it);
            if (!ok) return false;
            const m = toTagMap(it.tags_array);
            return formalityAllowedForOccasion(m, 'work');
          }
        }

        // Other occasions: your existing compatibility
        return isOccasionCompatible(it, occasion);
      });
  };

  // Candidate builder reused by all passes
  const produceCandidates = (items) => {
    const tops     = items.filter(i => TOPS.includes(i.category));
    const bottomsA = items.filter(i => BOTTOMS.includes(i.category));
    const dresses  = items.filter(i => i.category === DRESS || i.category === "Dress");
    const jackets  = items.filter(i => i.category === JACKET || i.category === "Jacket");
    const shoes    = items.filter(i => i.category === SHOES);
    const accs     = items.filter(i => i.category === ACCESS);

    const bottoms = (applyWeather && tempF < TEMP_SHORTS_MIN)
      ? bottomsA.filter(b => b.category !== "Shorts")
      : bottomsA;

    if (!shoes.length || (!dresses.length && (!tops.length || !bottoms.length))) return [];

    shuffle(tops); shuffle(bottoms); shuffle(dresses);
    shuffle(jackets); shuffle(shoes); shuffle(accs);

    const scoreItem = (it) => tagScore(it, tempF, occasion, applyWeather);
    const K = { top:6, bottom:6, dress:6, jacket:5, shoe:8, acc:5 };

    const topsK    = topN(tops,    scoreItem, K.top);
    const bottomsK = topN(bottoms, scoreItem, K.bottom);
    const dressesK = topN(dresses, scoreItem, K.dress);
    const jacketsK = topN(jackets, scoreItem, K.jacket);
    const shoesK   = topN(shoes,   scoreItem, K.shoe);
    const accsK    = topN(accs,    scoreItem, K.acc);

    const cands = [];
    const addCand = (items, base, catBias = 0) => {
      let s = items.reduce((sum, it)=>sum + scoreItem(it), 0);
      s += colorScore(items);
      s += (Math.random() - 0.5) * COMBO_JITTER;
      s += catBias;
      cands.push({ items, base, score: s });
    };

    const makeCombos_TopBottom = () => {
      for (const t of topsK) for (const b of bottomsK) {
        for (const s of shoesK.slice(0,6)) {
          const base = `T:${t.id}|B:${b.id}|S:${s.id}`;
          const plain = [t,b,s];
          if (comboRuleCheck(plain, occasion)) addCand(plain, base, 0);

          if (applyWeather && tempF <= TEMP_JACKET_MAX && jacketsK.length) {
            for (const j of jacketsK.slice(0,2)) {
              const setJ = [t,j,b,s];
              if (comboRuleCheck(setJ, occasion)) addCand(setJ, base, 0.3);
            }
          }

          for (const a of accsK.slice(0,2)) {
            const setA = [t,b,s,a];
            if (comboRuleCheck(setA, occasion)) addCand(setA, base, 0.2);
          }
        }
      }
    };

    const makeCombos_Dress = () => {
      const dressBias = (occasion === "going out") ? 0.7 : -1.0;
      for (const d of dressesK) for (const s of shoesK.slice(0,6)) {
        const base = `D:${d.id}|S:${s.id}`;
        const plain = [d,s];
        if (comboRuleCheck(plain, occasion)) addCand(plain, base, dressBias);

        for (const a of accsK.slice(0,2)) {
          const setA = [d,a,s];
          if (comboRuleCheck(setA, occasion)) addCand(setA, base, dressBias + 0.2);
        }

        if (applyWeather && tempF <= TEMP_VERY_COLD && jacketsK.length) {
          for (const j of jacketsK.slice(0,2)) {
            const setJ = [d,j,s];
            if (comboRuleCheck(setJ, occasion)) addCand(setJ, base, dressBias);
          }
        }
      }
    };

    if (occasion === "going out") { makeCombos_Dress(); makeCombos_TopBottom(); }
    else { makeCombos_TopBottom(); makeCombos_Dress(); }

    return cands;
  };

  // Pass 1: STRICT for workout/work; normal for others
  let itemsStrict = buildItems(true);
  let cands = produceCandidates(itemsStrict);

  // Pass 2: RELAXED fallback for workout/work if not enough candidates
  if ((occasion === 'workout' || occasion === 'work') && cands.length < limit) {
    const itemsRelax = buildItems(false);
    const candsRelax = produceCandidates(itemsRelax);
    if (candsRelax.length >= cands.length) {
      cands = candsRelax;
    }
  }

  if (!cands.length) return [];

  // Softmax sampling; relax "recently seen" for workout/work or when pool is small
  const out = [];
  const seenBase = new Set();
  const seenExact = new Set();
  const candidates = cands.slice();

  const relaxVariety =
    (occasion === 'workout' || occasion === 'work' || candidates.length < limit * 2);

  while (out.length < limit && candidates.length) {
    const weights = candidates.map(c => Math.exp(c.score / SOFTMAX_TEMP));
    const sum = weights.reduce((a,b)=>a+b,0);
    if (sum <= 0) break;

    let r = Math.random() * sum, pick = 0;
    for (; pick < weights.length; pick++) {
      r -= weights[pick];
      if (r <= 0) break;
    }
    const c = candidates.splice(pick, 1)[0];

    const eKey = exactKey(c.items);
    if (!eKey) continue;

    if (seenBase.has(c.base) || seenExact.has(eKey)) continue;
    if (!relaxVariety && seenRecently(userId, eKey)) continue;

    seenBase.add(c.base);
    seenExact.add(eKey);
    rememberOutfit(userId, eKey);

    out.push({ id: null, items: c.items, tempF, occasion, favorited: false });
  }

  return out;
}



export default { generateOutfitsForUser };
