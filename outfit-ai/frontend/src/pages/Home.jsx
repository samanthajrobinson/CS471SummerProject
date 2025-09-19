// src/pages/Home.jsx
import React from "react";
import { api } from "../lib/api";
import OutfitCard from "../components/OutfitCard";

// geolocation helpers
function getPosition(opts) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}
async function getAutoTempF() {
  try {
    const pos = await getPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
    const { latitude, longitude } = pos.coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=fahrenheit`;
    const r = await fetch(url);
    const j = await r.json();
    const t = j?.current_weather?.temperature;
    return typeof t === "number" ? Math.round(t) : null;
  } catch {
    return null;
  }
}

// ✅ Only these five options
const OCCASIONS = [
  { value: "casual",    label: "Casual" },
  { value: "work",      label: "Work" },
  { value: "workout",   label: "Workout" },
];

// try multiple paths until one returns 200 (ignore 404s)
async function getFromFirst(paths, config) {
  let lastErr;
  for (const p of paths) {
    try {
      const { data } = await api.get(p, config);
      return data;
    } catch (e) {
      if (e?.response?.status === 404) { lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr;
}

function normalizeOutfit(o, i) {
  return {
    id: o?.id ?? o?.outfitId ?? null,
    items: Array.isArray(o?.items) ? o.items : [],
    favorited: !!(o?.favorited ?? o?.is_favorite),
    tempF: o?.tempF,
    occasion: o?.occasion ?? "",
    _key: o?.id ?? o?.outfitId ?? `o-${i}`,
  };
}

export default function Home() {
  const [outfits, setOutfits] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [weatherMode, setWeatherMode] = React.useState("auto"); // auto|cold|warm
  const [autoNote, setAutoNote] = React.useState("");

  // ✅ Occasion state & handler
  const [occasion, setOccasion] = React.useState("casual"); // "", "casual", "work", "workout", "going_out"
  const changeOccasion = (e) => {
    const v = e.target.value;
    setOccasion(v);
    loadNew(weatherMode, v);
  };

  const GEN_PATHS = React.useMemo(() => ["/outfits/generate", "/api/outfits/generate"], []);
  const FAV_PATHS = React.useMemo(() => ["/favorites", "/outfits/favorites", "/api/favorites", "/api/outfits/favorites"], []);
  const [favBase] = React.useState(FAV_PATHS[0]); // kept for compatibility

  const resolveTemp = React.useCallback(async (mode) => {
    if (mode === "cold") return 45;
    if (mode === "warm") return 75;
    setAutoNote("Locating…");
    const t = await getAutoTempF();
    if (t == null) { setAutoNote("Location unavailable — 65°F"); return 65; }
    setAutoNote(`Using local ${t}°F`);
    return t;
  }, []);

  // 🔗 Pass occasion to the AI generator
  const loadNew = React.useCallback(async (mode = weatherMode, occ = occasion) => {
    setLoading(true); setErr("");
    try {
      const tempF = await resolveTemp(mode);
      const data = await getFromFirst(GEN_PATHS, {
        params: { count: 9, tempF, occasion: occ || undefined, colors: "pink,black,white" },
        withCredentials: true,
      });
      const list = Array.isArray(data?.outfits) ? data.outfits : (Array.isArray(data) ? data : []);
      setOutfits(list.map((o, i) => normalizeOutfit(o, i)));
    } catch (e) {
      setErr(e?.response?.data?.error || "could not generate outfits");
      setOutfits([]);
    } finally {
      setLoading(false);
    }
  }, [GEN_PATHS, resolveTemp, weatherMode, occasion]);

  React.useEffect(() => { loadNew("auto", ""); }, []); // initial load

  // favorite/unfavorite (kept as in your file)
  const toggleFavorite = async (outfit, liked) => {
    if (liked) {
      const ids = (outfit.items || []).map(i => i.id).filter(Boolean);
      const { data } = await api.post("/favorites", { items: ids });
      outfit.id = data?.outfitId ?? outfit.id;
      outfit.favorited = true;
    } else {
      if (outfit.id) {
        await api.delete(`/favorites/${outfit.id}`);
      }
      outfit.favorited = false;
    }
  };

  return (
    <div className="page">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="mr-auto text-xl font-bold">New Outfits</h2>
        
        {/*  Occasion dropdown (only 5 choices) */}
        <label className="sr-only" htmlFor="occasion">Occasion:</label>
        <select
          id="occasion"
          value={occasion}
          onChange={changeOccasion}
          className="text-sm text-gray-600 rounded-full border px-3 py-1 bg-white"
          style={{ minWidth: 180 }}
        >
          {OCCASIONS.map(o => (
            <option key={o.value || "any"} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* Weather select */}
        <label className="text-sm text-gray-600">
          {" "}
          <select
            className="rounded-full border px-3 py-1 bg-white"
            value={weatherMode}
            onChange={(e) => { setWeatherMode(e.target.value); setAutoNote(""); loadNew(e.target.value, occasion); }}
          >
            <option value="auto">Auto</option>
            <option value="cold">Cold</option>
            <option value="warm">Warm</option>
          </select>
        </label>

        {weatherMode === "auto" && <span className="text-sm text-gray-500">{autoNote}</span>}

        <button
          className="rounded-full bg-pink-500 text-white px-4 py-1 shadow hover:bg-pink-600"
          onClick={() => loadNew(weatherMode, occasion)}
          type="button"
        >
          Regenerate
        </button>
      </div>

      {loading && <div className="text-gray-500">Loading…</div>}
      {err && <div className="text-rose-600">{err}</div>}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {outfits.map((o, idx) => (
          <OutfitCard
            key={o._key ?? o.id ?? idx}
            outfit={o}
            initialLiked={!!o.favorited}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>
    </div>
  );
}
