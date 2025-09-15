// backend/src/routes/tags.js
import { Router } from "express";
const router = Router();

const TAXONOMY = {
  occasion: ["casual","work","workout","going out","everyday"],
  activity: ["running","training","hiking","travel"],
  formality: ["casual","smart-casual","business","formal"],
  fit: ["slim","regular","relaxed","tailored","oversized"],
  material: ["cotton","denim","wool","linen","leather","synthetic","silk"],
  pattern: ["solid","striped","plaid","floral","graphic"],
  footwear: ["sneaker","boot","heel","loafer","sandal","open-toe","oxford"],
  warmth: ["summer","transitional","winter","insulated","lightweight"],
  neckline: ["crew","v","henley","turtleneck"],
  sleeve: ["sleeveless","short","long"],
  rise: ["low","mid","high"],
  length: ["short","knee","midi","ankle","full"],
  style: ["streetwear","dressy","basic","athletic","minimal","preppy"],
};

router.get("/", (_req, res) => {
  // return namespaced values e.g. "fit:relaxed"
  const out = Object.fromEntries(
    Object.entries(TAXONOMY).map(([ns, vals]) => [ns, vals.map(v => `${ns}:${v}`)])
  );
  res.json(out);
});

export default router;
