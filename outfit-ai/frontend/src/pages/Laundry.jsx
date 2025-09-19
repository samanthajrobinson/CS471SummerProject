import React from "react";
import { api } from "../lib/api";

const ITEM_BASES = ["/items", "/api/items"];

// normalize how we send "clean" to servers that store null or "Clean"
function normalizeOutgoingStatus(s) {
  if (!s) return null;
  if (s.toLowerCase() === "clean") return null; // most backends store null for clean
  if (s.toLowerCase() === "laundry") return "Laundry";
  return s;
}

// normalize incoming for UI filtering
function normalizeIncomingStatus(s) {
  if (s == null || String(s).trim() === "") return "Clean";
  return String(s);
}

// to absolute image
function absolute(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (api.defaults.baseURL || "").replace(/\/+$/, "");
  return `${base}/${String(url).replace(/^\/+/, "")}`;
}

export default function Laundry() {
  const [itemsBase, setItemsBase] = React.useState(ITEM_BASES[0]);
  const [tab, setTab] = React.useState("Laundry"); // "Laundry" | "Clean"
  const [items, setItems] = React.useState([]);
  const [selected, setSelected] = React.useState(new Set());
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr("");
    setSelected(new Set());

    // Some backends accept ?status=, some ignore it. We filter client-side too.
    const params = { status: tab };
    let lastErr;
    for (const base of ITEM_BASES) {
      try {
        const { data } = await api.get(base, { params, withCredentials: true });
        const list = Array.isArray(data) ? data : [];
        // client-side filter by normalized status
        const filtered = list.filter(
          (i) => normalizeIncomingStatus(i?.status) === tab
        );
        setItems(filtered);
        setItemsBase(base);
        setLoading(false);
        return;
      } catch (e) {
        lastErr = e;
        // if it's not a 404, don't keep trying other bases
        if (e?.response?.status !== 404) {
          setErr("Failed to load items");
          setLoading(false);
          return;
        }
      }
    }
    // both bases failed
    setErr("Failed to load items");
    setLoading(false);
  }, [tab]);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleOne = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  // Try a list of requests until one works
  const tryRequests = async (attempts) => {
    let lastErr;
    for (const fn of attempts) {
      try {
        const res = await fn();
        return res;
      } catch (e) {
        lastErr = e;
        // continue
      }
    }
    throw lastErr;
  };

const singleMove = async (id, toStatus) => {
  const sNorm =
    !toStatus || String(toStatus).toLowerCase() === 'clean' ? null : 'Laundry';
  // Try /:id/status on /items, then /api/items
  const bases = [itemsBase, itemsBase === '/items' ? '/api/items' : '/items'];
  for (const base of bases) {
    try {
      await api.patch(`${base}/${id}/status`, { status: sNorm }, { withCredentials: true });
      setItemsBase(base);
      await load();
      return;
    } catch (e) {
      if (e?.response?.status !== 404) throw e;
    }
  }
  alert('Move failed (status endpoint not found)');
};

const bulkMove = async (toStatus) => {
  if (selected.size === 0) return;
  const ids = [...selected];
  const sNorm =
    !toStatus || String(toStatus).toLowerCase() === 'clean' ? null : 'Laundry';
  const bases = [itemsBase, itemsBase === '/items' ? '/api/items' : '/items'];
  for (const base of bases) {
    try {
      await api.post(`${base}/status/bulk`, { ids, status: sNorm }, { withCredentials: true });
      setItemsBase(base);
      await load();
      return;
    } catch (e) {
      if (e?.response?.status !== 404) throw e;
    }
  }
  alert('Bulk move failed (status endpoint not found)');
};


  const allChecked = items.length > 0 && selected.size === items.length;

  return (
    <div className="page">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="mr-auto text-xl font-bold">Laundry</h2>

        <div className="rounded-full border overflow-hidden">
          <button
            className={`px-4 py-1 ${tab === "Laundry" ? "bg-pink-100 border-r" : ""}`}
            onClick={() => setTab("Laundry")}
          >
            In Laundry
          </button>
          <button
            className={`px-4 py-1 ${tab === "Clean" ? "bg-pink-100" : ""}`}
            onClick={() => setTab("Clean")}
          >
            Clean
          </button>
        </div>

        <div className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={toggleAll}>
            {allChecked ? "Unselect all" : "Select all"}
          </button>
          {tab === "Clean" ? (
            <button className="btn" onClick={() => bulkMove("Laundry")}>
              Move selected → Laundry
            </button>
          ) : (
            <button
              className="rounded-full bg-pink-500 text-white px-4 py-0.5 shadow hover:bg-pink-600"
              onClick={() => bulkMove("Clean")}
            >
              Return selected → Closet
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-gray-500">Loading…</div>}
      {err && <div className="text-rose-600">{err}</div>}

      <div className="grid gap-4 items-start grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((it) => (
          <div key={it.id} className="relative rounded-2xl border bg-white p-3 shadow-sm">
            {/* checkbox */}
            <label className="absolute left-2 top-2 inline-flex items-center gap-2 bg-white/80 rounded-full border px-2 py-1">
              <input
                type="checkbox"
                checked={selected.has(it.id)}
                onChange={() => toggleOne(it.id)}
              />
              <span className="text-xs">Select</span>
            </label>

            <div className="h-[220px] flex items-center justify-center overflow-hidden">
              {it?.image_url ? (
                <img
                  src={absolute(it.image_url)}
                  alt={it.category}
                  className="max-h-full w-auto object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="text-xs text-gray-500">image unavailable</div>
              )}
            </div>

            <div className="mt-2 text-xs text-gray-700 flex items-center justify-between">
              <div>
                <div className="font-medium">{it.category || "—"}</div>
                <div className="text-gray-500">{it.brand || "—"}</div>
              </div>
              {tab === "Clean" ? (
                <button
                  className="btn-ghost"
                  onClick={() => singleMove(it.id, "Laundry")}
                  title="Move to Laundry"
                >
                  To Laundry
                </button>
              ) : (
                <button
                  className="btn-ghost"
                  onClick={() => singleMove(it.id, "Clean")}
                  title="Return to Closet"
                >
                  To Closet
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
