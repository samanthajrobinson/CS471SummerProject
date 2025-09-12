// src/components/ItemEditModal.jsx
import React from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";

/* ---------- auto-resolve the correct base path (/items or /api/items) ---------- */
let ITEM_BASE = null;
async function resolveItemBase() {
  if (ITEM_BASE) return ITEM_BASE;
  const bases = ["/items", "/api/items"];
  for (const b of bases) {
    try {
      const r = await api.get(`${b}/tags/all`, { withCredentials: true });
      if (r.status < 400) { ITEM_BASE = b; return b; }
    } catch {}
  }
  ITEM_BASE = "/items";
  return ITEM_BASE;
}
const getJson  = async (p, params)   => api.get(`${await resolveItemBase()}${p}`, { params });
const patchJson= async (p, body)     => api.patch(`${await resolveItemBase()}${p}`, body);
const patchForm= async (p, formData) => api.patch(`${await resolveItemBase()}${p}`, formData, { headers: { "Content-Type": "multipart/form-data" } });

const CATEGORIES = ["Shirts","T-shirts","Sweaters","Hoodie","Jackets","Pants","Shorts","Dresses","Shoes"];
const STATUSES   = ["Clean","Laundry"];

export default function ItemEditModal({ open, item, onClose, onSaved }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [suggestions, setSuggestions] = React.useState([]);
  const [form, setForm] = React.useState(seed(item));
  const [photo, setPhoto] = React.useState(null);
  const [tagQuery, setTagQuery] = React.useState("");
  const [tagsOpen, setTagsOpen] = React.useState(false);

  React.useEffect(() => { setForm(seed(item)); setPhoto(null); setError(""); }, [item, open]);

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { data } = await getJson("/tags/all");
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {}
    })();
  }, [open]);

  if (!open || !item) return null;
  if (typeof window === "undefined") return null; // SSR safety

  const addTag = (t) => {
    const v = String(t).trim().toLowerCase();
    if (!v) return;
    setForm(f => ({ ...f, tags: Array.from(new Set([...(f.tags||[]), v])) }));
    setTagQuery("");
  };
  const removeTag = (t) => setForm(f => ({ ...f, tags: (f.tags||[]).filter(x => x !== t) }));
  const filtered = (tagQuery ? suggestions.filter(s => s.toLowerCase().includes(tagQuery.toLowerCase())) : suggestions)
                    .filter(s => !(form.tags||[]).includes(s)).slice(0,50);

  const save = async () => {
    setBusy(true); setError("");
    try {
      if (photo) {
        const fd = new FormData();
        fd.append("photo", photo); // field name must be "photo"
        await patchForm(`/${item.id}/photo`, fd);
      }
      await patchJson(`/${item.id}`, {
        category: form.category,
        brand: form.brand,
        color: form.color,
        size: form.size,
        status: form.status,
        tags: form.tags,
      });
      // refresh one item (optional)
      const { data } = await getJson(`/${item.id}`);
      onSaved?.(data || { ...item, ...form });
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.detail || e?.response?.data?.error || e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[9999]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose?.()} />
      {/* dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Edit Item</h3>
            <button className="px-2 py-1 text-sm rounded border" onClick={onClose} disabled={busy}>✕</button>
          </div>

          {error && <div className="mb-3 rounded bg-rose-50 text-rose-700 text-sm px-3 py-2">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select className="w-full rounded border px-3 py-2 text-sm"
                value={form.category}
                onChange={(e)=>setForm(f=>({...f,category:e.target.value}))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select className="w-full rounded border px-3 py-2 text-sm"
                value={form.status}
                onChange={(e)=>setForm(f=>({...f,status:e.target.value}))}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Brand</label>
              <input className="w-full rounded border px-3 py-2 text-sm"
                value={form.brand}
                onChange={(e)=>setForm(f=>({...f,brand:e.target.value}))}
                placeholder="e.g. Nike"/>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
              <input className="w-full rounded border px-3 py-2 text-sm"
                value={form.color}
                onChange={(e)=>setForm(f=>({...f,color:e.target.value}))}
                placeholder="e.g. black"/>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Size</label>
              <input className="w-full rounded border px-3 py-2 text-sm"
                value={form.size}
                onChange={(e)=>setForm(f=>({...f,size:e.target.value}))}
                placeholder="e.g. M"/>
            </div>

            <div className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">Change Photo</label>
              <input type="file" accept="image/*" className="w-full rounded border px-3 py-1 text-sm"
                onChange={(e)=>setPhoto(e.target.files?.[0] || null)} />
              {photo && <div className="mt-1 text-xs text-gray-500">{photo.name}</div>}
            </div>

            {/* Tags */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(form.tags||[]).map(t => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-pink-50 text-pink-700 px-2 py-1 text-xs">
                    {t}
                    <button type="button" className="text-pink-700/70 hover:text-pink-900" onClick={()=>removeTag(t)}>✕</button>
                  </span>
                ))}
              </div>

              <div className="relative">
                <div className="flex gap-2">
                  <input
                    className="w-full rounded border px-3 py-2 text-sm"
                    placeholder="Type to search or add…"
                    value={tagQuery}
                    onChange={(e)=>{ setTagQuery(e.target.value); setTagsOpen(true); }}
                    onFocus={()=>setTagsOpen(true)}
                    onKeyDown={(e)=>{ if (e.key === "Enter") { e.preventDefault(); addTag(tagQuery); }}}
                  />
                  <button type="button" className="rounded bg-pink-500 text-white px-3 py-2 text-sm hover:bg-pink-600"
                          onClick={()=>addTag(tagQuery)}>Add</button>
                </div>

                {tagsOpen && filtered.length > 0 && (
                  <div className="absolute z-[10000] mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-white shadow-lg"
                       onMouseDown={(e)=>e.preventDefault()}>
                    {filtered.map(s => (
                      <button key={s} type="button"
                        className="block w-full text-left px-3 py-2 hover:bg-pink-50"
                        onClick={()=>{ addTag(s); setTagsOpen(false); }}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end gap-2">
            <button className="rounded border px-3 py-2 text-sm" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="rounded bg-pink-500 text-white px-3 py-2 text-sm hover:bg-pink-600"
                    onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/* helpers */
function seed(item) {
  return {
    category: item?.category || "Shirts",
    status: item?.status || "Clean",
    brand: item?.brand || "",
    color: item?.color || "",
    size: item?.size || "",
    tags: Array.isArray(item?.tags) ? item.tags : [],
  };
}
