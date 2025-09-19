function ItemCard({ item, onEdit }) {
  const tags = Array.isArray(item?.tags_array)
    ? item.tags_array
    : (typeof item?.tags === "string"
        ? item.tags.split(",").map(s => s.trim()).filter(Boolean)
        : []);

  return (
    <div className="relative group rounded-2xl border bg-white p-3 shadow-sm">
      {/* edit button */}
      <button
        onClick={onEdit}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition
                   h-9 w-9 rounded-full border bg-white/80 flex items-center justify-center"
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

      {/* image */}
      <div className="h-[220px] flex items-center justify-center overflow-hidden">
        {item?.image_url ? (
          <img
            src={toImageSrc(item.image_url)}
            alt={item.category}
            className="max-h-full w-auto object-contain"
            loading="lazy"
          />
        ) : (
          <div className="text-xs text-gray-500">image unavailable</div>
        )}
      </div>

      {/* meta */}
      <div className="mt-2 text-xs text-gray-700">
        <div className="font-medium">{item.category || "—"}</div>
        <div className="text-gray-500">{item.brand || "—"}</div>
      </div>

      {/* TAGS: show as chips */}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.slice(0, 12).map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-full text-[11px] bg-pink-50 border border-pink-200"
              title={t}
            >
              {prettyTagLabel(t)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
