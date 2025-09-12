// backend/src/upload.js
import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import multer from "multer";

// --- Config / toggles ---
const API_KEY = process.env.REMOVE_BG_API_KEY || "";
const REMOVE_BG_ENABLED = !["0","false","off"].includes(String(process.env.REMOVE_BG_ENABLED ?? "1").toLowerCase());

// Prefer an explicit UPLOADS_DIR from env; else keep legacy if present; else fallback to ./uploads
async function pickUploadsDir() {
  const fromEnv = process.env.UPLOADS_DIR && path.resolve(process.cwd(), process.env.UPLOADS_DIR);
  const legacy  = path.resolve(process.cwd(), "src", "uploads");
  const modern  = path.resolve(process.cwd(), "uploads");

  if (fromEnv) return fromEnv;
  if (fssync.existsSync(legacy)) return legacy;
  return modern;
}

const dir = await pickUploadsDir();
await fs.mkdir(dir, { recursive: true });
export const UPLOADS_DIR = dir;

// Ensure URL uses forward slashes
const toUrl = (absPath) => "/uploads/" + path.basename(absPath).replace(/\\/g, "/");

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname || "") || ".png").toLowerCase();
    const name = Date.now() + "-" + Math.random().toString(36).slice(2) + ext;
    cb(null, name);
  },
});

export const upload = multer({ storage });

/**
 * Try remove.bg; return absolute path to transparent file if success, else null
 */
export async function maybeRemoveBg(absPath) {
  try {
    if (!REMOVE_BG_ENABLED) return null;
    if (!API_KEY) {
      console.warn("remove.bg disabled (missing REMOVE_BG_API_KEY)");
      return null;
    }

    // Node 20+ has fetch/FormData/Blob
    const buf = await fs.readFile(absPath);
    const form = new FormData();
    form.append("image_file", new Blob([buf]), path.basename(absPath));
    form.append("size", "auto");
    form.append("format", "png");

    const resp = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": API_KEY },
      body: form,
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.warn("remove.bg failed:", resp.status, text.slice(0, 200));
      return null;
    }

    const out = Buffer.from(await resp.arrayBuffer());
    const outPath = absPath.replace(/\.[^.]+$/, "") + "-nobg.png";
    await fs.writeFile(outPath, out);
    return outPath;
  } catch (e) {
    console.warn("remove.bg error:", e.message);
    return null;
  }
}

/**
 * Build a URL string like /uploads/filename.png from an absolute file path
 */
export function filePathToUrl(absPath) {
  return toUrl(absPath);
}
