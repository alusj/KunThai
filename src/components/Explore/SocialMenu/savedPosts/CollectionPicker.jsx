import { HiOutlineCheck, HiOutlineFolder } from "react-icons/hi2";

import { itemIsInCollection } from "../../../../Backend/services/explore/savedService";

export default function CollectionPicker({ collections, onToggle, postId }) {
  if (!collections.length) {
    return null;
  }

  return (
    <div className="mb-3 rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Collections</p>
      <div className="flex flex-wrap gap-2">
        {collections.map((collection) => {
          const active = itemIsInCollection(collection, postId);
          return (
            <button
              key={collection.id}
              type="button"
              onClick={() => onToggle(collection.id, postId)}
              className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-black ${
                active ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {active ? <HiOutlineCheck /> : <HiOutlineFolder />}
              {collection.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
