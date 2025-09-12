import React from 'react';
import { api } from '../lib/api';
import OutfitCard from '../components/OutfitCard';

export default function Discover() {
  const [feed, setFeed] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await api.get('/outfits/discover');
        if (!cancel) setFeed(r.data || []);
      } catch (e) {
        if (!cancel) setErr(e?.response?.data?.error || 'Failed to load discover feed');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const fav = async (id) => {
    try { await api.post(`/outfits/${id}/favorite`); } catch {}
  };

  return (
    <div className="page">
      <div className="bar">
        <h2>Discover</h2>
      </div>

      {loading && <div className="muted">Loading…</div>}
      {err && <div className="err">{err}</div>}

      <div className="grid">
        {feed.map((o) => (
          <div key={o.id} style={{ width: '100%' }}>
            <OutfitCard outfit={o} onFav={fav} />
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              @{o.username} • {o.like_count} {o.like_count === 1 ? 'favorite' : 'favorites'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
