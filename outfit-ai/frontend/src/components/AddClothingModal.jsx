import React from "react";
import { api } from "../lib/api";
import TagMultiSelect from "./TagMultiSelect";

const CATS = ["Shirts","T-shirts","Sweaters","Hoodie","Shorts","Pants","Dresses","Jackets","Accessories","Shoes"];
const STATUS = ["Clean","Laundry"];

export default function AddClothingModal({ onClose, onSaved, itemsBase: itemsBaseProp }) {
  const [form, setForm] = React.useState({ category: "Shirts", status: "Clean", brand: "", color: "", size: "" });
  const [tags, setTags] = React.useState([]);
  const [file, setFile] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  // try /items then /api/items, remember winner
  const [itemsBase, setItemsBase] = React.useState(itemsBaseProp || "/items");

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const save = async () => {
    setErr("");
    if (!file) { setErr("Please select a file."); return; }
    setBusy(true);

    const send = async (base) => {
      const fd = new FormData();
      fd.append("category", form.category);
      fd.append("status", form.status || "Clean");
      fd.append("brand", form.brand || "");
      fd.append("color", form.color || "");
      fd.append("size", form.size || "");
      fd.append("tags", JSON.stringify(tags));   // server will parse JSON
      fd.append("photo", file);

      await api.post(base, fd); // don't set Content-Type; browser sets boundary
    };

    try {
      await send(itemsBase);
      onSaved?.();
    } catch (e1) {
      if (e1?.response?.status === 404) {
        const alt = itemsBase === "/items" ? "/api/items" : "/items";
        try {
          await send(alt);
          setItemsBase(alt);
          onSaved?.();
        } catch (e2) {
          setErr(e2?.response?.data?.error || "failed to add item");
        }
      } else {
        setErr(e1?.response?.data?.error || "failed to add item");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold">Add clothing</h3>
          <button onClick={onClose} className="h-9 w-9 rounded-full border bg-white">✕</button>
        </div>

        {err && <div className="mb-3 text-rose-600">{err}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <div className="text-sm mb-1">Category</div>
            <select className="input" value={form.category} onChange={(e)=>set("category", e.target.value)}>
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="block">
            <div className="text-sm mb-1">Status</div>
            <select className="input" value={form.status} onChange={(e)=>set("status", e.target.value)}>
              {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label className="block">
            <div className="text-sm mb-1">Brand</div>
            <input className="input" value={form.brand} onChange={(e)=>set("brand", e.target.value)} placeholder="brand"/>
          </label>

          <label className="block">
            <div className="text-sm mb-1">Color</div>
            <input className="input" value={form.color} onChange={(e)=>set("color", e.target.value)} placeholder="e.g. black"/>
          </label>

          <label className="block">
            <div className="text-sm mb-1">Size</div>
            <input className="input" value={form.size} onChange={(e)=>set("size", e.target.value)} placeholder="M"/>
          </label>

          <label className="block md:col-span-2 overflow-visible">
            <div className="text-sm mb-1">Tags</div>
            <TagMultiSelect value={tags} onChange={setTags} />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm mb-1">Photo</div>
            <div className="flex items-center gap-3">
              <label className="rounded-full bg-pink-500 text-white px-4 py-2 shadow hover:bg-pink-600 cursor-pointer">
                Choose file
                <input type="file" accept="image/*" className="hidden" onChange={(e)=>setFile(e.target.files?.[0] || null)} />
              </label>
              <span className="text-sm text-gray-600">
                {file ? file.name : "No file chosen"}
              </span>
            </div>
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button disabled={busy} className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
