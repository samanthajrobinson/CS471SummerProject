// backend/src/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from "path";

import authRoutes from './routes/auth.js';
import itemsRoutes from './routes/items.js';
import outfitsRoutes from './routes/outfits.js';     
import favoritesRoutes from './routes/favorites.js';
import { UPLOADS_DIR } from './upload.js';
import discoverRoutes from "./routes/discover.js";

import likesRoutes from "./routes/likes.js";
import tagsRoutes from "./routes/tags.js";

const app = express();

const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';
const PORT = Number(process.env.PORT || 4000);

// Core middleware
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static uploads
app.use('/uploads', express.static(UPLOADS_DIR));

// ---------- Routes (import once, mount anywhere) ----------
app.use("/likes", likesRoutes);
app.use("/api/likes", likesRoutes);
app.use("/tags", tagsRoutes);

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use("/uploads", express.static(UPLOADS_DIR));

app.use("/discover", discoverRoutes);
app.use("/api/discover", discoverRoutes);

app.use('/items', itemsRoutes);
app.use('/api/items', itemsRoutes);

if (outfitsRoutes) {
  app.use('/outfits', outfitsRoutes);
  app.use('/api/outfits', outfitsRoutes);
}

if (favoritesRoutes) {
  app.use('/favorites', favoritesRoutes);
  app.use('/api/favorites', favoritesRoutes);
  // optional legacy aliases:
  app.use('/outfits/favorites', favoritesRoutes);
  app.use('/api/outfits/favorites', favoritesRoutes);
}

const legacyDir = path.resolve(process.cwd(), "src", "uploads");
if (legacyDir !== UPLOADS_DIR) {
  try {
    if (fssync.existsSync(legacyDir)) {
      app.use("/uploads", express.static(legacyDir));
    }
  } catch {}
}

// Health & 404
app.get('/health', (req, res) => res.json({ ok: true }));
app.use((req, res) => res.status(404).json({ error: 'not found' }));

app.listen(PORT, () => {
  console.log(`🚀 backend on http://localhost:${PORT}`);
  console.log(`CORS origin: ${ORIGIN}`);
  console.log(`Uploads: ${UPLOADS_DIR}`);
});
