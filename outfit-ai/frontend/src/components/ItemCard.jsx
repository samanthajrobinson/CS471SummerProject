export default function ItemCard({ item, onEdit, bulkMode=false, selected=false, onToggleSelect }) {
  const src = `http://localhost:4000${item.image_url}`;

  const handleClick = () => {
    if (bulkMode) onToggleSelect?.(item.id);
    else onEdit?.(item);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e)=>{ if(e.key==='Enter') handleClick(); }}
      className={`relative bg-white rounded-2xl border border-gray-200 shadow-soft overflow-hidden hover:shadow-lg transition ${
        bulkMode ? 'ring-2 ring-offset-2 ring-transparent' : ''
      }`}
    >
      {/* Bulk checkbox */}
      {bulkMode && (
        <div className="absolute left-2 top-2 z-10">
          <div className={`w-6 h-6 rounded-md border-2 ${selected ? 'bg-[#f28ab3] border-[#e07ca6]' : 'bg-white border-gray-500'} grid place-items-center text-xs font-black`}>
            {selected ? '✓' : ''}
          </div>
        </div>
      )}

      <div className="aspect-square p-2 bg-white">
        <img
          src={src}
          alt={item.category || "item"}
          className="w-full h-full object-contain bg-white"
          onError={(e)=>{ e.currentTarget.alt='image unavailable'; e.currentTarget.classList.add('opacity-60'); }}
        />
      </div>

      <div className="p-2 flex gap-1 flex-wrap">
        <span className="px-2 py-1 rounded-full border border-gray-200 bg-white text-xs font-black">{item.category}</span>
        {item.color && <span className="px-2 py-1 rounded-full border border-gray-200 bg-white text-xs font-black">{item.color}</span>}
        {item.brand && <span className="px-2 py-1 rounded-full border border-gray-200 bg-white text-xs font-black">{item.brand}</span>}
      </div>
    </div>
  );
}
