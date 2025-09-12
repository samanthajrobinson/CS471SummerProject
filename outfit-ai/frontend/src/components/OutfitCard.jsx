import React from "react";
import { api } from "../lib/api";

const TOPS = ["Shirts", "T-shirts", "Sweaters", "Hoodie"];
const BOTTOMS = ["Pants", "Shorts"];
const JACKET = "Jackets";
const SHOES = "Shoes";
const DRESS = "Dresses";

const toImageSrc = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (api.defaults.baseURL || "").replace(/\/+$/, "");
  return `${base}/${String(url).replace(/^\/+/, "")}`;
};

export default function OutfitCard({
  outfit,
  likedProp,                 // <-- controlled like state (boolean)
  initialLiked = false,      // kept for Home compatibility
  onToggleFavorite,
  showLikesBadge,
}) {
  // Use controlled liked if provided, else fall back to initial
  const liked = typeof likedProp === "boolean"
    ? likedProp
    : (outfit?.favorited ?? initialLiked ?? false);

  const [busy, setBusy] = React.useState(false);

  const items  = Array.isArray(outfit?.items) ? outfit.items : [];
  const top    = items.find((i) => TOPS.includes(i?.category));
  const jacket = items.find((i) => i?.category === JACKET);
  const dress  = items.find((i) => i?.category === DRESS);
  const bottom = dress ? null : items.find((i) => BOTTOMS.includes(i?.category));
  const shoes  = items.find((i) => i?.category === SHOES);

  const likesCount = Number.isFinite(Number(outfit?.likes)) ? Number(outfit.likes) : null;

  const toggle = async (e) => {
    e?.preventDefault?.(); e?.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      await onToggleFavorite?.(outfit, !liked);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative isolate rounded-2xl border bg-white p-4 pb-6 shadow-sm flex flex-col gap-6 overflow-y-visible overflow-x-hidden">
      {/* Likes badge (Discover & Profile) */}
      {showLikesBadge && likesCount !== null && (
        <span className="absolute left-3 top-3 z-40 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
          {likesCount} {likesCount === 1 ? "like" : "likes"}
        </span>
      )}

      {/* Heart */}
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={liked}
        aria-label={liked ? "Unlike" : "Like"}
        title={liked ? "Unlike" : "Like"}
        className={[
          "absolute right-3 top-3 z-50 pointer-events-auto",
          "h-9 w-9 rounded-full border bg-white/90 flex items-center justify-center disabled:opacity-60 transition-colors",
          liked ? "text-pink-500 border-pink-300 bg-pink-50" : "text-neutral-900 border-black/10"
        ].join(" ")}
        type="button"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 pointer-events-none">
          <path
            d="M12 21s-6.7-4.1-9.3-7.4C1.3 11.8 1 9.4 2.5 7.8 4 6.2 6.5 6.4 8 8c.7.7 1.2 1.5 1.5 2.2.3-.7.8-1.5 1.5-2.2 1.5-1.6 4-1.8 5.5-.2 1.5 1.6 1.2 4-.2 5.8C18.7 16.9 12 21 12 21z"
            fill={liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>

      {(top || jacket) && (
        <div className="grid grid-cols-2 gap-4 pointer-events-none">
          <Piece kind="top"    item={top} />
          <Piece kind="jacket" item={jacket} />
        </div>
      )}
      {dress ? (
        <div className="pointer-events-none"><Piece kind="dress" item={dress} /></div>
      ) : bottom ? (
        <div className="pointer-events-none"><Piece kind="bottom" item={bottom} /></div>
      ) : null}
      {shoes && <div className="pointer-events-none"><Piece kind="shoes" item={shoes} /></div>}
    </div>
  );
}

function Piece({ kind, item }) {
  let wrap = "relative z-0 w-full flex items-end justify-center";
  let img  = "pointer-events-none select-none object-contain";
  if (kind === "top" || kind === "jacket") { wrap += " h-[180px] overflow-hidden"; img += " h-full w-auto max-w-[70%]"; }
  else if (kind === "bottom") { wrap += " h-[200px] overflow-visible"; img += " h-[280px] w-auto max-w-none -mb-6"; }
  else if (kind === "dress") { wrap += " h-[260px] overflow-hidden"; img += " h-full max-h-full w-auto max-w-full"; }
  else if (kind === "shoes") { wrap += " h-[110px] overflow-hidden"; img += " h-full w-auto max-w-[40%]"; }
  else { wrap += " h-[200px] overflow-hidden"; img += " h-full w-auto max-w-full"; }

  const src = item?.image_url ? toImageSrc(item.image_url) : "";
  return <div className={wrap}>{src ? <img src={src} alt={item?.category || kind} className={img} /> : <div className="text-xs text-gray-400">—</div>}</div>;
}
