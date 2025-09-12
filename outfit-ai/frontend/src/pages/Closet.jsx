// src/pages/Closet.jsx
import React from "react";
import { api } from "../lib/api";
import AddClothingModal from "../components/AddClothingModal";
import ItemEditModal from "../components/ItemEditModal";

const CATEGORIES = [
  "Shirts", "T-shirts", "Sweaters", "Hoodie",
  "Shorts", "Pants", "Dresses", "Jackets",
  "Accessories", "Shoes", "All",
];

// Make a safe absolute URL from a stored path like /uploads/xxx.png
const toImageSrc = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (api.defaults.baseURL || "").replace(/\/+$/, "");
  return `${base}/${String(url).replace(/^\/+/, "")}`;
};

export default function Closet() {
  const [category, setCategory] = React.useState("All");
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [showAdd, setShowAdd] = React.useState(false);
  const [editing, setEditing] = React.useState(null); // <- item being edited

  // try /items first, then /api/items on 404; remember which worked
  const [itemsBase, setItemsBase] = React.useState("/items");

  const loadItems = React.useCallback(async () => {
    setLoading(true);
    setErr("");

    const params = {};
    if (category && category !== "All") params.category = category;

    const attempt = async (base) => {
      const { data } = await api.get(base, { params, withCredentials: true });
      return Array.isArray(data) ? data : [];
    };

    try {
      const data = await attempt(itemsBase);
      setItems(data);
    } catch (e1) {
      const status = e1?.response?.status;
      const alt = itemsBase === "/items" ? "/api/items" : "/items";
      if (status === 404) {
        try {
          const data = await attempt(alt);
          setItemsBase(alt);
          setItems(data);
        } catch {
          setErr("Failed to load closet");
          setItems([]);
        }
      } else {
        setErr("Failed to load closet");
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [category, itemsBase]);

  React.useEffect(() => { loadItems(); }, [loadItems]);

  return (
    <div className="flex gap-6">
      {/* Left: categories (kept) */}
      <aside className="w-[280px] shrink-0">
        <div className="rounded-2xl bg-white/80 shadow-sm border p-4">
          <div className="text-sm font-semibold text-gray-700 mb-2">Categories</div>
          <div className="flex flex-col gap-3">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`w-full text-left rounded-xl border px-4 py-2 transition ${
                  c === category
                    ? "bg-pink-100/80 border-pink-300"
                    : "bg-white hover:bg-gray-50"
                }`}
                type="button"
              >
                {c}
              </button>
            ))}
          </div>

          <button
            className="mt-5 w-full rounded-full bg-pink-500 text-white px-4 py-2 shadow hover:bg-pink-600"
            onClick={() => setShowAdd(true)}
            type="button"
          >
            + Add clothing
          </button>
        </div>
      </aside>

      {/* Right: items */}
      <section className="min-w-0 flex-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">{category}</h2>
        </div>

        {loading && <div className="text-gray-500">Loading…</div>}
        {err && <div className="text-rose-600">{err}</div>}
        {!loading && !err && items.length === 0 && (
          <div className="text-gray-600 text-sm">
            No items in {category}. Click “+ Add clothing” to upload one.
          </div>
        )}

        <div className="grid gap-4 items-start grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} onEdit={() => setEditing(item)} />
          ))}
        </div>
      </section>

      {/* Modals */}
      {showAdd && (
        <AddClothingModal
          itemsBase={itemsBase} // if your modal supports it
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadItems(); }}
        />
      )}

      {/* ✅ pass open prop so the modal actually renders */}
      <ItemEditModal
        open={!!editing}
        itemsBase={itemsBase}     // optional; modal auto-resolves /items vs /api/items
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); loadItems(); }}
      />
    </div>
  );
}

/* ----------------------------- Item Card ------------------------------ */
function ItemCard({ item, onEdit }) {
  return (
    <div className="relative group rounded-2xl border bg-white p-3 shadow-sm">
      {/* EDIT button — high z-index, always clickable */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="absolute right-2 top-2 z-50 h-9 w-9 rounded-full border bg-white/90
                   flex items-center justify-center shadow-sm hover:bg-pink-50 transition"
        title="Edit"
        aria-label="Edit item"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path
            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.84-1.83z"
            fill="currentColor"
          />
        </svg>
      </button>

      <div className="h-[220px] flex items-center justify-center overflow-hidden">
        {item?.image_url ? (
          <img
            src={toImageSrc(item.image_url)}
            alt={item.category}
            className="max-h-full w-auto object-contain pointer-events-none"
            loading="lazy"
          />
        ) : (
          <div className="text-xs text-gray-500">image unavailable</div>
        )}
      </div>

      <div className="mt-2 text-xs text-gray-700">
        <div className="font-medium">{item.category || "—"}</div>
        <div className="text-gray-500">
          {[item.brand, item.color, item.size].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>
    </div>
  );
}
