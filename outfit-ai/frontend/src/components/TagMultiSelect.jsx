import React from "react";

const DEFAULT_OPTIONS = [
  "casual","streetwear","smart casual","business","formal","party","date",
  "vacation","work","school","gym","athleisure","loungewear",
  "warm","cold","rain","snow","windy","layering","spring","summer","fall","winter",
  "minimal","preppy","boho","edgy","y2k","vintage",
  "neutral","monochrome","colorful","pink","black","white","denim"
];

export default function TagMultiSelect({ value = [], onChange, options = DEFAULT_OPTIONS, placeholder = "Search or add tag…" }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef(null);

  const clean = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

  const add = (t) => {
    const tag = clean(t);
    if (!tag) return;
    if (!value.includes(tag)) onChange?.([...value, tag]);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const remove = (t) => onChange?.(value.filter((x) => x !== t));

  const filtered = options
    .filter((o) => !value.includes(o) && (!query || o.includes(clean(query))))
    .slice(0, 20);

  const onKeyDown = (e) => {
    if ((e.key === "Enter" || e.key === "," || e.key === "Tab") && query) {
      e.preventDefault(); add(query);
    } else if (e.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    }
  };

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1 rounded-xl border px-2 py-2 bg-white
                   focus-within:ring-2 focus-within:ring-pink-300"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-pink-100 text-pink-700 px-2 py-1 text-xs">
            {tag}
            <button type="button" className="ml-1 hover:text-pink-900" onClick={(e) => { e.stopPropagation(); remove(tag); }} aria-label={`Remove ${tag}`}>×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="min-w-[10ch] flex-1 bg-transparent outline-none text-sm placeholder:text-gray-400"
        />
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 mt-1 z-50 rounded-xl border bg-white shadow-lg max-h-60 overflow-auto"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.length === 0 && clean(query) ? (
            <button type="button" className="w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => add(query)}>
              Add “{clean(query)}”
            </button>
          ) : (
            filtered.map((opt) => (
              <button key={opt} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => add(opt)}>
                {opt}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
