import React from "react";
import { api } from "../lib/api";
import OutfitCard from "../components/OutfitCard";

export default function Profile() {
  const [favs, setFavs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const { data } = await api.get('/favorites');   // <-- changed
      setFavs(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load favorites");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  const onToggleFavorite = async (outfit, next) => {
    // Profile only supports un-favoriting (heart off)
    if (!next && outfit?.id) {
      await api.delete(`/favorites/${outfit.id}`);     // <-- changed
      setFavs(prev => prev.filter(x => x.id !== outfit.id));
    }
  };

  return (
    <div>
      <h2 className="font-black text-xl mb-4">My Favorites</h2>
      {loading && <div className="text-gray-500">Loading…</div>}
      {err && <div className="text-rose-600">{err}</div>}
      {!loading && !err && favs.length === 0 && (
        <div className="text-gray-600">You haven’t favorited any outfits yet.</div>
      )}

      <div className="grid gap-6 items-start grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {favs.map(o => (
          <OutfitCard
            key={o.id}
            outfit={o}
            initialLiked={true}
            onToggleFavorite={(id, next) => onToggleFavorite(o, next)}
          />
        ))}
      </div>
    </div>
  );
}
