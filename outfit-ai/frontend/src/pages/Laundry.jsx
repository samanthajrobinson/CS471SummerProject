import React from "react";
import { api } from "../lib/api";

const ITEM_BASES = ["/items", "/api/items"];

export default function Laundry() {
  const [itemsBase, setItemsBase] = React.useState(ITEM_BASES[0]);
  const [tab, setTab] = React.useState("Laundry"); // "Laundry" or "Clean"
  const [items, setItems] = React.useState([]);
  const [selected, setSelected] = React.useState(new Set());
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true); setErr(""); setSelected(new Set());
    const params = { status: tab }; // backend: accept ?status=Laundry/Clean (optional); if you don't have it, filter client-side
    let lastErr;
    for (const base of ITEM_BASES) {
      try {
        const { data } = await api.get(base, { params });
        setItems(Array.isArray(data) ? data.filter(i => (i?.status||"Clean") === tab) : []);
        setItemsBase(base);
        setLoading(false);
        return;
      } catch (e) {
        lastErr = e;
        if (e?.response?.status !== 404) { setErr("Failed to load items"); setLoading(false); return; }
      }
    }
    setErr("Failed to load items"); setLoading(false);
  }, [tab]);

  React.useEffect(() => { load(); }, [load]);

  const toggleOne = (id) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const bulkMove = async (toStatus) => {
    if (selected.size === 0) return;
    const ids = [...selected];
    try {
      await api.post(`${itemsBase}/laundry/bulk`, { ids, status: toStatus });
      await load();
    } catch (e) {
      // fallback if the server path differs
      const alt = itemsBase === "/items" ? "/api/items" : "/items";
      try {
        await api.post(`${alt}/laundry/bulk`, { ids, status: toStatus });
        setItemsBase(alt);
        await load();
      } catch {
        alert("Bulk move failed");
      }
    }
  };

  const singleMove = async (id, toStatus) => {
    try {
      await api.patch(`${itemsBase}/${id}/status`, { status: toStatus });
      await load();
    } catch (e) {
      const alt = itemsBase === "/items" ? "/api/items" : "/items";
      try {
        await api.patch(`${alt}/${id}/status`, { status: toStatus });
        setItemsBase(alt);
        await load();
      } catch {
        alert("Move failed");
      }
    }
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
          >In Laundry</button>
          <button
            className={`px-4 py-1 ${tab === "Clean" ? "bg-pink-100" : ""}`}
            onClick={() => setTab("Clean")}
          >Clean</button>
        </div>

        <div className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={toggleAll}>
            {allChecked ? "Unselect all" : "Select all"}
          </button>
          {tab === "Clean" ? (
            <button className="btn" onClick={() => bulkMove("Laundry")}>Move selected → Laundry</button>
          ) : (
            <button className="rounded-full bg-pink-500 text-white px-4 py-0.5 shadow hover:bg-pink-600" onClick={() => bulkMove("Clean")}>Return selected → Closet</button>
          )}
        </div>
      </div>

      {loading && <div className="text-gray-500">Loading…</div>}
      {err && <div className="text-rose-600">{err}</div>}

      <div className="grid gap-4 items-start grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(it => (
          <div key={it.id} className="relative rounded-2xl border bg-white p-3 shadow-sm">
            {/* checkbox */}
            <label className="absolute left-2 top-2 inline-flex items-center gap-2 bg-white/80 rounded-full border px-2 py-1">
              <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleOne(it.id)} />
              <span className="text-xs">Select</span>
            </label>

            <div className="h-[220px] flex items-center justify-center overflow-hidden">
              {it?.image_url
                ? <img src={absolute(it.image_url)} alt={it.category} className="max-h-full w-auto object-contain" />
                : <div className="text-xs text-gray-500">image unavailable</div>}
            </div>

            <div className="mt-2 text-xs text-gray-700 flex items-center justify-between">
              <div>
                <div className="font-medium">{it.category || "—"}</div>
                <div className="text-gray-500">{it.brand || "—"}</div>
              </div>
              {tab === "Clean" ? (
                <button className="btn-ghost" onClick={() => singleMove(it.id, "Laundry")}>To Laundry</button>
              ) : (
                <button className="btn-ghost" onClick={() => singleMove(it.id, "Clean")}>To Closet</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function absolute(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (api.defaults.baseURL || "").replace(/\/+$/, "");
  return `${base}/${String(url).replace(/^\/+/, "")}`;
}
